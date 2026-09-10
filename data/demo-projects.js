window.DEMO_PROJECT_CONTEXT = {
  company: "Nordstern Business Solutions GmbH",
  profile: "Medium-sized B2B distributor and service provider",
  footprint: "Germany, Austria and Switzerland",
  employees: "Approximately 850 employees",
  situation: "Growth has increased the volume of service requests, product questions and email orders. Core systems exist, but knowledge and operational data remain fragmented across teams."
};

window.DEMO_PROJECTS = [
  {
    id: "DEMO-01",
    title: "AI-assisted service request resolution",
    businessFunction: "Customer service",
    problem: "Service agents spend substantial time classifying requests, searching for answers and collecting missing information. Resolution quality and speed vary by agent experience.",
    proposedSolution: "Introduce an AI copilot that classifies incoming requests, retrieves approved guidance, drafts responses and proposes routing. Simple cases may be resolved automatically only after a controlled pilot.",
    intendedOutcome: "Reduce handling time and improve first-contact resolution while maintaining service quality.",
    users: "Approximately 65 customer-service agents and 8 team leads",
    process: "Email and portal requests are triaged in Jira Service Management, enriched with CRM and order information, and escalated when required.",
    capabilities: ["Text classification", "Retrieval-augmented generation", "Response drafting", "Workflow routing"],
    dataSources: [
      { name: "Historical service tickets", status: "Confirmed", detail: "Approximately 30 months of request and resolution history" },
      { name: "Approved service knowledge", status: "Assumed", detail: "Spread across SharePoint and team documentation" },
      { name: "Customer and order context", status: "Confirmed", detail: "Available through CRM and ERP records" }
    ],
    systems: ["Jira Service Management", "Microsoft Dynamics 365", "SAP S/4HANA", "SharePoint"],
    scale: "Approximately 4,500 requests per month; German and English",
    humanOversight: "Agents approve drafted responses during the MVP. Refunds, contractual commitments and unusual cases always require human review.",
    constraints: ["Customer and contract data require role-based access", "Quality must be measurable before automation is expanded", "Response sources must be traceable"],
    assumptions: ["Historic tickets contain usable resolution outcomes", "A sufficiently current approved knowledge subset can be identified"],
    unknowns: ["Share of requests suitable for automated resolution", "Consistency of ticket labels across teams"],
    evidence: ["Customer-service workshop notes", "Service-volume export", "Current-system overview"],
    requirementSignals: ["Ticket history quality", "Approved knowledge availability", "System access", "Human review", "Service-quality measurement"],
    assessmentContext: {
      relevant_process: "email and portal service requests",
      record_set: "closed Jira Service Management tickets",
      history_period: "the last 12 months",
      ticket_outcome_fields: "final routing, resolution status and handling timestamps",
      ticket_labels: "request category, priority and responsible team labels",
      service_scope: "German and English requests across the intended pilot categories",
      service_knowledge_sources: "the SharePoint guidance and team documentation needed for the pilot",
      ticket_system: "Jira Service Management",
      customer_context_systems: "Microsoft Dynamics 365 and SAP S/4HANA",
      service_workflow: "the current Jira triage and response workflow",
      review_role: "customer-service agents and team leads",
      service_metrics: "handling time, first-contact resolution and response-quality indicators"
    }
  },
  {
    id: "DEMO-02",
    title: "Conversational internal knowledge access",
    businessFunction: "Cross-functional operations",
    problem: "Employees struggle to locate current product, process and policy information. Answers are distributed across repositories and experienced colleagues are repeatedly asked the same questions.",
    proposedSolution: "Provide an internal conversational assistant that retrieves permission-appropriate information, cites its sources and directs users to an owner when no reliable answer is available.",
    intendedOutcome: "Reduce search effort and repeated expert requests while making approved internal knowledge easier to use.",
    users: "Initial pilot for 150 service, sales and operations employees; potential expansion to approximately 850 employees",
    process: "Employees currently search several repositories or contact subject-matter experts through Teams and email.",
    capabilities: ["Semantic search", "Retrieval-augmented generation", "Source citation", "Permission-aware retrieval"],
    dataSources: [
      { name: "SharePoint knowledge sites", status: "Confirmed", detail: "Primary home for policies and process guidance" },
      { name: "Confluence spaces", status: "Confirmed", detail: "Product and technical documentation with uneven ownership" },
      { name: "Teams and network-drive documents", status: "Assumed", detail: "Potentially useful but not yet approved as authoritative sources" }
    ],
    systems: ["Microsoft 365", "SharePoint", "Confluence", "Microsoft Entra ID"],
    scale: "Pilot across three functions with mixed German and English content",
    humanOversight: "Content owners remain responsible for source accuracy. The assistant must abstain or escalate when evidence is insufficient.",
    constraints: ["Existing document permissions must be preserved", "Answers require visible citations", "Outdated and duplicate documents must not be treated equally"],
    assumptions: ["A bounded pilot knowledge domain can be agreed", "Identity groups broadly reflect permitted access"],
    unknowns: ["Proportion of content with an accountable owner", "Extent of conflicting or outdated guidance"],
    evidence: ["Employee pain-point workshop", "Repository inventory", "Example search journeys"],
    requirementSignals: ["Knowledge ownership", "Document quality", "Permission model", "Grounded answers", "Abstention and escalation"],
    assessmentContext: {
      relevant_process: "employee searches and knowledge requests",
      knowledge_repositories: "the SharePoint sites and Confluence spaces proposed for the pilot",
      knowledge_scope: "the selected service, sales and operations knowledge domains",
      identity_system: "Microsoft Entra ID",
      pilot_users: "the initial 150 service, sales and operations users",
      source_metadata: "document owner, approval status, modification date and source URL",
      language_scope: "German and English content",
      escalation_role: "the responsible content owner",
      knowledge_test_scope: "representative employee questions from the three pilot functions"
    }
  },
  {
    id: "DEMO-03",
    title: "Email order-intent extraction into ERP",
    businessFunction: "Order management",
    problem: "Order-management staff manually interpret customer emails and attachments, resolve product references and enter order data into SAP. Rework occurs when information is incomplete or customer-specific product codes are ambiguous.",
    proposedSolution: "Extract order headers and line items from emails and attachments, validate them against master data and present a structured draft order for human approval before it is posted to SAP.",
    intendedOutcome: "Reduce manual entry effort and order-cycle time without weakening commercial controls.",
    users: "Approximately 35 order-management employees",
    process: "Orders arrive in shared mailboxes as free text, spreadsheets and PDFs. Staff identify the customer and products, check terms, resolve exceptions and create the sales order in SAP.",
    capabilities: ["Document understanding", "Information extraction", "Entity resolution", "Validation workflow", "ERP integration"],
    dataSources: [
      { name: "Historic order emails and attachments", status: "Confirmed", detail: "Available in shared mailboxes under defined retention rules" },
      { name: "Product and customer master data", status: "Confirmed", detail: "Maintained in SAP with known local variations" },
      { name: "Customer-specific product mappings", status: "Unknown", detail: "Some mappings are stored in local team files or agent knowledge" }
    ],
    systems: ["Microsoft Exchange Online", "SAP S/4HANA", "Shared mailboxes", "Local mapping files"],
    scale: "Approximately 6,000 order-related emails per month; around 60% are believed to follow recurring formats",
    humanOversight: "Every generated order remains a draft during the MVP. Staff approve line items, customer identity, quantities, prices and delivery details.",
    constraints: ["No autonomous ERP posting during the initial phase", "Commercial terms and prices must come from authoritative systems", "Attachments may contain sensitive customer information"],
    assumptions: ["A representative historic sample can be accessed", "SAP provides a supported interface for creating draft orders"],
    unknowns: ["Coverage of customer-specific article-number mappings", "Frequency of handwritten or low-quality scanned orders"],
    evidence: ["Order-management workshop", "Mailbox-volume estimate", "Sample order documents", "SAP process walkthrough"],
    requirementSignals: ["Representative document sample", "Master-data quality", "ERP interface", "Validation workflow", "Customer-specific product-code resolution"],
    provisionalRequirementCandidate: "Duplicate-order prevention and idempotent ERP posting",
    assessmentContext: {
      relevant_process: "email-order intake and draft-order creation",
      order_messages: "historic order emails and attachments from the shared order mailboxes",
      history_period: "the last 12 months",
      order_formats: "free-text emails, spreadsheets and PDF order forms",
      order_fields: "customer, product, quantity, price, delivery address and requested delivery date",
      master_data_sources: "SAP customer, product and commercial master data",
      customer_product_mappings: "customer-specific product-code mappings",
      mailbox_system: "Microsoft Exchange Online shared mailboxes",
      erp_system: "SAP S/4HANA",
      review_role: "order-management staff",
      order_scope: "historical orders within the recurring email formats included in the MVP",
      order_metrics: "manual entry time, field-level accuracy, rework and order-cycle time"
    }
  }
];
