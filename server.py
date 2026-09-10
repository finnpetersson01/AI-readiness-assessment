"""Local server and LiteLLM proxy for the AI Project Readiness prototype."""

from __future__ import annotations

import argparse
import base64
import io
import json
import os
import re
import subprocess
import sys
import threading
import urllib.error
import urllib.request
import webbrowser
import zipfile
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from xml.etree import ElementTree


APP_DIR = Path(__file__).resolve().parent
CONFIG_FILE = APP_DIR / "llm.env"
DEMO_PROJECT_DIR = APP_DIR / "demo-project-files"
SPREADSHEET_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
RELATIONSHIP_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
DOCUMENT_RELATIONSHIP_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"


def load_local_config() -> dict[str, str]:
    values: dict[str, str] = {}
    if CONFIG_FILE.exists():
        for raw_line in CONFIG_FILE.read_text(encoding="utf-8-sig").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip().strip('"').strip("'")

    return {
        "api_key": os.environ.get("LITELLM_API_KEY", values.get("LITELLM_API_KEY", "")),
        "base_url": os.environ.get("LITELLM_BASE_URL", values.get("LITELLM_BASE_URL", "")).rstrip("/"),
    }


def upstream_url(base_url: str, path: str) -> str:
    cleaned = base_url.rstrip("/")
    for suffix in ("/chat/completions", "/models"):
        if cleaned.endswith(suffix):
            cleaned = cleaned[: -len(suffix)]
    return f"{cleaned}{path}"


def upstream_json(
    method: str,
    url: str,
    api_key: str,
    payload: dict[str, Any] | None = None,
    timeout: int = 120,
) -> dict[str, Any]:
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = urllib.request.Request(
        url,
        data=body,
        method=method,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def extract_model_ids(payload: dict[str, Any]) -> list[str]:
    items = payload.get("data", payload.get("models", []))
    result: list[str] = []
    for item in items if isinstance(items, list) else []:
        model_id = item.get("id") if isinstance(item, dict) else item
        if model_id and str(model_id) not in result:
            result.append(str(model_id))
    return result


def generation_parameters(model: str, max_output_tokens: int) -> dict[str, Any]:
    """Use the parameter family supported by the selected provider model."""
    normalized = model.lower()
    if "gpt-5" in normalized:
        # GPT-5 deployments use max_completion_tokens; some reject custom sampling settings.
        return {"max_completion_tokens": max_output_tokens}
    return {"temperature": 0.1, "max_tokens": max_output_tokens}


def extract_message_content(payload: dict[str, Any]) -> str:
    try:
        content = payload["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise ValueError("LiteLLM response did not contain choices[0].message.content.") from exc

    if isinstance(content, list):
        content = "".join(
            part.get("text", "") if isinstance(part, dict) else str(part)
            for part in content
        )
    text = str(content).strip()
    if text.startswith("```"):
        lines = text.splitlines()
        if lines:
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines).strip()
    return text


def trim_words(value: Any, maximum: int) -> str:
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    words = text.split()
    if len(words) <= maximum:
        return text
    return " ".join(words[:maximum]).rstrip(" ,;:-") + "..."


def normalize_assessment_suggestion(suggestion: dict[str, Any]) -> dict[str, Any]:
    """Keep advisory output concise even when a model ignores format guidance."""
    normalized = dict(suggestion)
    normalized["rationale"] = trim_words(normalized.get("rationale"), 55)

    question = re.sub(r"\s+", " ", str(normalized.get("followUpQuestion") or "")).strip()
    question = re.split(
        r"\s+(?:—|-|,)?\s*and\s+(?=(?:will|can|is|are|has|have|does|do|would|could|should)\b)",
        question,
        maxsplit=1,
        flags=re.IGNORECASE,
    )[0]
    question = trim_words(question, 28).rstrip(" .!?;,:—-")
    normalized["followUpQuestion"] = f"{question}?" if question else "What evidence would best confirm this assessment?"
    return normalized


def spreadsheet_column_index(reference: str) -> int:
    letters = re.match(r"[A-Z]+", reference.upper())
    result = 0
    for character in letters.group(0) if letters else "A":
        result = result * 26 + ord(character) - 64
    return result - 1


def spreadsheet_cell_value(cell: ElementTree.Element, shared_strings: list[str]) -> str:
    cell_type = cell.attrib.get("t", "")
    if cell_type == "inlineStr":
        return "".join(node.text or "" for node in cell.findall(f".//{{{SPREADSHEET_NS}}}t"))
    value = cell.find(f"{{{SPREADSHEET_NS}}}v")
    text = value.text if value is not None and value.text is not None else ""
    if cell_type == "s" and text.isdigit() and int(text) < len(shared_strings):
        return shared_strings[int(text)]
    return text


def parse_xlsx_sheets(content: bytes) -> dict[str, list[list[str]]]:
    if len(content) > 2_000_000:
        raise ValueError("Project workbooks must be smaller than 2 MB.")

    with zipfile.ZipFile(io.BytesIO(content)) as archive:
        workbook_root = ElementTree.fromstring(archive.read("xl/workbook.xml"))
        rels_root = ElementTree.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        relationship_targets = {
            item.attrib["Id"]: item.attrib["Target"]
            for item in rels_root.findall(f"{{{RELATIONSHIP_NS}}}Relationship")
        }
        shared_strings: list[str] = []
        if "xl/sharedStrings.xml" in archive.namelist():
            shared_root = ElementTree.fromstring(archive.read("xl/sharedStrings.xml"))
            shared_strings = [
                "".join(node.text or "" for node in item.findall(f".//{{{SPREADSHEET_NS}}}t"))
                for item in shared_root.findall(f"{{{SPREADSHEET_NS}}}si")
            ]

        sheets: dict[str, list[list[str]]] = {}
        sheet_nodes = workbook_root.find(f"{{{SPREADSHEET_NS}}}sheets")
        if sheet_nodes is None:
            raise ValueError("The workbook contains no worksheets.")
        for sheet in list(sheet_nodes):
            name = sheet.attrib.get("name", "")
            relationship_id = sheet.attrib.get(f"{{{DOCUMENT_RELATIONSHIP_NS}}}id", "")
            target = relationship_targets.get(relationship_id, "")
            if not name or not target:
                continue
            normalized_target = target.lstrip("/")
            if not normalized_target.startswith("xl/"):
                normalized_target = f"xl/{normalized_target}"
            root = ElementTree.fromstring(archive.read(normalized_target))
            rows: list[list[str]] = []
            for row in root.findall(f".//{{{SPREADSHEET_NS}}}row")[:500]:
                values: list[str] = []
                for cell in row.findall(f"{{{SPREADSHEET_NS}}}c")[:20]:
                    column = spreadsheet_column_index(cell.attrib.get("r", "A1"))
                    while len(values) <= column:
                        values.append("")
                    values[column] = spreadsheet_cell_value(cell, shared_strings)
                rows.append(values)
            sheets[name] = rows
        return sheets


def rows_to_list(rows: list[list[str]]) -> list[str]:
    return [row[0].strip() for row in rows[1:] if row and row[0].strip()]


def project_from_workbook(content: bytes) -> dict[str, Any]:
    sheets = parse_xlsx_sheets(content)
    required_sheets = {"Project", "Data Sources", "Systems", "Assessment Context"}
    missing_sheets = sorted(required_sheets - sheets.keys())
    if missing_sheets:
        raise ValueError(f"Missing required worksheet(s): {', '.join(missing_sheets)}.")

    project: dict[str, Any] = {}
    for row in sheets["Project"][1:]:
        if len(row) >= 3 and row[1].strip():
            project[row[1].strip()] = row[2].strip()

    project["capabilities"] = rows_to_list(sheets.get("Capabilities", []))
    project["systems"] = rows_to_list(sheets.get("Systems", []))
    project["constraints"] = rows_to_list(sheets.get("Constraints", []))
    project["assumptions"] = rows_to_list(sheets.get("Assumptions", []))
    project["unknowns"] = rows_to_list(sheets.get("Unknowns", []))
    project["evidence"] = rows_to_list(sheets.get("Evidence", []))
    project["requirementSignals"] = rows_to_list(sheets.get("Requirement Signals", []))
    project["dataSources"] = [
        {
            "name": row[0].strip(),
            "status": row[1].strip() if len(row) > 1 else "",
            "detail": row[2].strip() if len(row) > 2 else "",
        }
        for row in sheets["Data Sources"][1:]
        if row and row[0].strip()
    ]
    project["assessmentContext"] = {
        row[0].strip(): row[1].strip()
        for row in sheets["Assessment Context"][1:]
        if len(row) > 1 and row[0].strip()
    }
    company_context = {
        row[0].strip(): row[1].strip()
        for row in sheets.get("Company", [])[1:]
        if len(row) > 1 and row[0].strip()
    }

    required_fields = [
        "id", "title", "businessFunction", "problem", "proposedSolution",
        "intendedOutcome", "users", "process", "scale", "humanOversight"
    ]
    missing_fields = [field for field in required_fields if not str(project.get(field, "")).strip()]
    if missing_fields:
        raise ValueError(f"Missing required project field(s): {', '.join(missing_fields)}.")
    return {"project": project, "companyContext": company_context}


def parse_uploaded_project_files(files: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, str]]]:
    if not files or len(files) > 20:
        raise ValueError("Upload between 1 and 20 project files.")
    projects: list[dict[str, Any]] = []
    errors: list[dict[str, str]] = []
    seen_ids: set[str] = set()
    for item in files:
        name = str(item.get("name", "Unnamed file"))
        try:
            content = base64.b64decode(str(item.get("contentBase64", "")), validate=True)
            if not name.lower().endswith(".xlsx"):
                raise ValueError("Only standardized .xlsx project workbooks are supported.")
            parsed = project_from_workbook(content)
            project = parsed["project"]
            if project["id"] in seen_ids:
                raise ValueError(f"Duplicate project ID {project['id']} in this upload.")
            seen_ids.add(project["id"])
            project["_import"] = {"fileName": name, "companyContext": parsed["companyContext"]}
            projects.append(project)
        except Exception as exc:
            errors.append({"fileName": name, "error": str(exc)})
    return projects, errors


def build_selection_messages(
    project: dict[str, Any],
    catalog: list[dict[str, Any]],
    scales: list[dict[str, Any]],
) -> list[dict[str, str]]:
    system_prompt = """
You are supporting an experienced AI consultant in defining project-specific readiness requirements.
Select only requirements that directly help determine whether the given project can be implemented.
Use the controlled catalog wherever possible. Do not select broad requirements merely because they are generally good practice.

Decision boundary:
- define what the project requires; do not assess whether the company currently fulfils it;
- a typical bounded MVP needs roughly 8 to 15 material requirements; select more only when the project has genuinely distinct technical, control or operating dependencies. Do not omit a necessary prerequisite merely to keep the list short;
- critical requirements are true MVP stop conditions only. There is no numeric cap, but each critical selection must meet the defined criticality test below;
- prefer the most specific applicable catalog variant;
- do not select both a granular variant and its broader parent for the same underlying prerequisite;
- where catalog items share a selectionFamily, they are variants of one assessment conversation. Select only the smallest set of variants needed to assess distinct conditions; do not select two variants that could be answered from the same evidence or client discussion;
- before returning the selection, challenge every item: does it test a distinct project prerequisite, is it more specific than an already selected item, and would removing it create a meaningful blind spot? Omit weaker, overlapping or merely desirable requirements and capture remaining uncertainty as a client clarification instead;
- rank selected requirements by decision value so the consultant can review the most important items first;
- preserve meaningful uncertainties rather than inventing project facts.

For each selected catalog requirement:
- preserve the exact catalogRequirementId;
- assign importance as supporting, important, or critical;
- assign requiredLevel as an integer from 0 to 4 using the linked controlled response scale and its observable anchors;
- explain the project-specific reason in one concise sentence;
- cite the project-input statements that support the selection in projectEvidence;
- record any inference not explicitly supported by the project input in assumption, otherwise return null.

Criticality test:
- Mark a requirement critical only when the MVP cannot proceed safely, lawfully or credibly without it, and there is no realistic near-term workaround.
- A manual review, reduced pilot scope, staged integration, temporary data preparation or other controlled fallback normally means the requirement is important, not critical.
- Do not use critical merely because a requirement is valuable, standard practice, creates delivery effort, or would improve quality.
- Before marking an item critical, ask: "Could a bounded MVP still run safely with an explicit control or workaround?" If yes, classify it as important.

Use important for material delivery dependencies and supporting for useful enablers that are not gates.

Project funding (SR01) must always be selected as critical. For SR01, propose a minimum credible MVP budget and a preferred budget including contingency in EUR.

Only propose a new requirement when the catalog does not contain the same assessable prerequisite. New requirements must be specific, observable, and answerable with a 0-4 scale.
For every new requirement, identify the closest catalog requirements and explain why they do not cover the condition.

Return JSON only, using exactly this structure:
{
  "selectedRequirements": [
    {
      "catalogRequirementId": "SR01",
      "selectionPriority": 1,
      "importance": "critical",
      "requiredLevel": 3,
      "requiredMinimumEur": 100000,
      "requiredPreferredEur": 150000,
      "rationale": "...",
      "projectEvidence": ["..."],
      "assumption": null
    }
  ],
  "proposedRequirements": [
    {
      "title": "...",
      "category": "...",
      "statement": "...",
      "assessmentQuestion": "...",
      "scaleId": "process_5",
      "importance": "important",
      "requiredLevel": 3,
      "rationale": "...",
      "projectEvidence": ["..."],
      "assumption": null,
      "closestCatalogRequirementIds": ["..."],
      "gapRationale": "..."
    }
  ],
  "selectionSummary": {
    "projectPattern": "...",
    "mainTechnicalPrerequisites": ["..."],
    "mainOrganizationalPrerequisites": ["..."],
    "criticalGates": ["..."],
    "criticalUncertainties": ["..."],
    "clientClarifications": ["..."]
  }
}
""".strip()

    user_payload = {
        "project": project,
        "controlledRequirementCatalog": catalog,
        "controlledResponseScales": scales,
    }
    return [
        {"role": "system", "content": system_prompt},
        {
            "role": "user",
            "content": "Create the readiness requirement proposal for this project:\n"
            + json.dumps(user_payload, ensure_ascii=False),
        },
    ]


def build_assessment_messages(
    project: dict[str, Any],
    requirement: dict[str, Any],
    client_context: str,
) -> list[dict[str, str]]:
    contract = (
        '{"availableMinimumEur": 0, "availableMaximumEur": 0, "confidence": "high | medium | low", '
        '"rationale": "Concise evidence-based explanation.", "followUpQuestion": "One practical question."}'
        if requirement.get("isFunding") else
        '{"level": 0, "confidence": "high | medium | low", '
        '"rationale": "Concise evidence-based explanation.", "followUpQuestion": "One practical question."}'
    )
    system_prompt = f"""
You support an experienced consultant during a client readiness assessment.
Interpret only the supplied client context against the selected project requirement. Do not invent systems, controls, funding or implementation facts. The suggestion remains advisory and the consultant reviews it before applying it.

Use the observable response anchors supplied with the requirement. Assess only this requirement. Do not lower or qualify the result because of gaps that belong to another requirement card, such as technical delivery, governance, data quality or funding, unless they are explicitly part of the selected requirement.

Choose the highest anchor directly supported by the client evidence, without using the project's required level as a scoring target. A bounded, named commitment may support a pilot-level anchor even when long-term capacity is not yet secured. If an anchor contains several conditions, every material condition must be supported; otherwise choose the lower supported anchor and ask for the missing evidence.

Keep the rationale to no more than 60 words. State the decisive evidence, how it maps to the selected anchor, and the single most important uncertainty. The follow-up must be one short, answerable question about this requirement only. Do not repeat the full project context or discuss unrelated workstreams.
For funding, return only the client's available funding range mentioned or reasonably bounded by the context, not a project-cost estimate.

Return JSON only, using exactly this structure:
{contract}
""".strip()
    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": json.dumps({
            "project": project,
            "selectedRequirement": requirement,
            "clientContext": client_context,
        }, ensure_ascii=False)},
    ]


class PrototypeHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, directory=str(APP_DIR), **kwargs)

    def log_message(self, format: str, *args: Any) -> None:
        print(f"[prototype] {self.address_string()} - {format % args}")

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store, max-age=0")
        super().end_headers()

    def send_json(self, status: int, payload: dict[str, Any]) -> None:
        encoded = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def do_GET(self) -> None:
        if self.path == "/api/health":
            config = load_local_config()
            configured = bool(config["api_key"] and config["base_url"])
            self.send_json(
                200,
                {
                    "status": "ready" if configured else "configuration_required",
                    "configured": configured,
                    "baseUrlConfigured": bool(config["base_url"]),
                    "keyConfigured": bool(config["api_key"]),
                },
            )
            return

        if self.path == "/api/models":
            config = load_local_config()
            if not config["api_key"] or not config["base_url"]:
                self.send_json(400, {"error": "Add LITELLM_API_KEY and LITELLM_BASE_URL to llm.env."})
                return
            try:
                payload = upstream_json(
                    "GET",
                    upstream_url(config["base_url"], "/models"),
                    config["api_key"],
                    timeout=30,
                )
                self.send_json(200, {"models": extract_model_ids(payload)})
            except urllib.error.HTTPError as exc:
                detail = exc.read().decode("utf-8", errors="replace")
                self.send_json(exc.code, {"error": f"LiteLLM model lookup failed: {detail[:500]}"})
            except Exception as exc:
                self.send_json(502, {"error": f"LiteLLM model lookup failed: {exc}"})
            return

        super().do_GET()

    def do_POST(self) -> None:
        if self.path == "/api/open-demo-folder":
            try:
                DEMO_PROJECT_DIR.mkdir(parents=True, exist_ok=True)
                if os.name == "nt":
                    subprocess.Popen(["explorer.exe", str(DEMO_PROJECT_DIR)])
                elif sys.platform == "darwin":
                    subprocess.Popen(["open", str(DEMO_PROJECT_DIR)])
                elif sys.platform.startswith("linux"):
                    subprocess.Popen(["xdg-open", str(DEMO_PROJECT_DIR)])
                else:
                    self.send_json(501, {"error": "Opening the folder is not supported on this operating system."})
                    return
                self.send_json(200, {"status": "opened", "path": str(DEMO_PROJECT_DIR)})
            except Exception as exc:
                self.send_json(500, {"error": f"The demo folder could not be opened: {exc}"})
            return

        if self.path == "/api/import-projects":
            try:
                content_length = int(self.headers.get("Content-Length", "0"))
                if content_length > 30_000_000:
                    self.send_json(413, {"error": "The combined upload is too large."})
                    return
                body = json.loads(self.rfile.read(content_length).decode("utf-8"))
                files = body.get("files")
                if not isinstance(files, list):
                    self.send_json(400, {"error": "Request must contain a files array."})
                    return
                projects, errors = parse_uploaded_project_files(files)
                status = 200 if projects else 400
                self.send_json(
                    status,
                    {
                        "projects": projects,
                        "errors": errors,
                        "importedCount": len(projects),
                    },
                )
            except json.JSONDecodeError:
                self.send_json(400, {"error": "The upload request was not valid JSON."})
            except Exception as exc:
                self.send_json(400, {"error": f"Project import failed: {exc}"})
            return

        if self.path == "/api/assess-requirement":
            config = load_local_config()
            if not config["api_key"] or not config["base_url"]:
                self.send_json(400, {"error": "Add LITELLM_API_KEY and LITELLM_BASE_URL to llm.env."})
                return
            try:
                content_length = int(self.headers.get("Content-Length", "0"))
                body = json.loads(self.rfile.read(content_length).decode("utf-8"))
                project = body.get("project")
                requirement = body.get("requirement")
                client_context = str(body.get("clientContext", "")).strip()
                model = str(body.get("model", "")).strip()
                if not isinstance(project, dict) or not isinstance(requirement, dict) or not client_context:
                    self.send_json(400, {"error": "Request must contain a project, requirement and client context."})
                    return
                if not model:
                    models = extract_model_ids(upstream_json("GET", upstream_url(config["base_url"], "/models"), config["api_key"], timeout=30))
                    if not models:
                        self.send_json(400, {"error": "No accessible LiteLLM model is available."})
                        return
                    model = models[0]

                request_payload = {
                    "model": model,
                    "messages": build_assessment_messages(project, requirement, client_context),
                    "response_format": {"type": "json_object"},
                    **generation_parameters(model, 500),
                }
                try:
                    llm_response = upstream_json("POST", upstream_url(config["base_url"], "/chat/completions"), config["api_key"], request_payload)
                except urllib.error.HTTPError as exc:
                    detail = exc.read().decode("utf-8", errors="replace")
                    if exc.code != 400 or ("response_format" not in detail and "gpt-5" not in model.lower()):
                        raise
                    request_payload.pop("response_format", None)
                    llm_response = upstream_json("POST", upstream_url(config["base_url"], "/chat/completions"), config["api_key"], request_payload)
                suggestion = json.loads(extract_message_content(llm_response))
                if not isinstance(suggestion, dict):
                    raise ValueError("The model did not return an assessment object.")
                self.send_json(200, {
                    "model": model,
                    "suggestion": normalize_assessment_suggestion(suggestion),
                    "usage": llm_response.get("usage"),
                })
            except urllib.error.HTTPError as exc:
                detail = exc.read().decode("utf-8", errors="replace")
                self.send_json(exc.code, {"error": f"LiteLLM request failed: {detail[:1000]}"})
            except json.JSONDecodeError as exc:
                self.send_json(502, {"error": f"The model did not return valid JSON: {exc}"})
            except Exception as exc:
                self.send_json(502, {"error": f"Assessment suggestion failed: {exc}"})
            return

        if self.path != "/api/select-requirements":
            self.send_json(404, {"error": "Unknown API route."})
            return

        config = load_local_config()
        if not config["api_key"] or not config["base_url"]:
            self.send_json(400, {"error": "Add LITELLM_API_KEY and LITELLM_BASE_URL to llm.env."})
            return

        try:
            content_length = int(self.headers.get("Content-Length", "0"))
            body = json.loads(self.rfile.read(content_length).decode("utf-8"))
            project = body.get("project")
            catalog = body.get("catalog")
            scales = body.get("scales")
            model = str(body.get("model", "")).strip()
            if not isinstance(project, dict) or not isinstance(catalog, list) or not isinstance(scales, list):
                self.send_json(400, {"error": "Request must contain a project object, catalog array and response-scales array."})
                return

            if not model:
                models_payload = upstream_json(
                    "GET",
                    upstream_url(config["base_url"], "/models"),
                    config["api_key"],
                    timeout=30,
                )
                models = extract_model_ids(models_payload)
                if not models:
                    self.send_json(400, {"error": "No model was selected and the proxy returned no models."})
                    return
                model = models[0]

            request_payload = {
                "model": model,
                "messages": build_selection_messages(project, catalog, scales),
                "response_format": {"type": "json_object"},
                **generation_parameters(model, 6000),
            }
            try:
                llm_response = upstream_json(
                    "POST",
                    upstream_url(config["base_url"], "/chat/completions"),
                    config["api_key"],
                    request_payload,
                    timeout=240,
                )
            except urllib.error.HTTPError as exc:
                detail = exc.read().decode("utf-8", errors="replace")
                if exc.code == 400 and ("response_format" in detail or "gpt-5" in model.lower()):
                    request_payload.pop("response_format", None)
                    llm_response = upstream_json(
                        "POST",
                        upstream_url(config["base_url"], "/chat/completions"),
                        config["api_key"],
                        request_payload,
                        timeout=240,
                    )
                else:
                    raise

            parsed = json.loads(extract_message_content(llm_response))
            self.send_json(
                200,
                {
                    "model": model,
                    "proposal": parsed,
                    "usage": llm_response.get("usage"),
                },
            )
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            self.send_json(exc.code, {"error": f"LiteLLM request failed: {detail[:1000]}"})
        except json.JSONDecodeError as exc:
            self.send_json(502, {"error": f"The model did not return valid JSON: {exc}"})
        except Exception as exc:
            self.send_json(502, {"error": f"Requirement generation failed: {exc}"})


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the local AI Project Readiness prototype.")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()

    url = f"http://127.0.0.1:{args.port}/"
    server = ThreadingHTTPServer(("127.0.0.1", args.port), PrototypeHandler)
    print(f"AI Project Readiness prototype: {url}")
    print(f"LiteLLM configuration: {CONFIG_FILE}")
    print("Press Ctrl+C to stop.")
    if not args.no_browser:
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping prototype.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
