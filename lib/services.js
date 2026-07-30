export const services = [
  {
    slug: '340b-program-consulting',
    eyebrow: '340B PROGRAM SERVICES',
    title: '340B Program Consulting',
    short: 'Compliance-focused support for covered entities, mixed-use environments, and contract pharmacy programs.',
    summary: 'Strengthen oversight, document defensible processes, prepare for audits, and identify opportunities without compromising program integrity.',
    outcomes: ['Improved audit readiness', 'Clearer ownership and controls', 'Reduced compliance risk', 'Sustainable program improvement'],
    capabilities: [
      'Independent external program audits',
      'HRSA audit preparation and mock audits',
      'Contract pharmacy oversight and optimization',
      'Mixed-use and accumulator workflow review',
      'Policy, procedure, and governance assessment',
      'Quarterly compliance monitoring',
      'Manufacturer restriction and block review',
      'Staff and leadership education'
    ],
    process: [
      ['Discover', 'Define the covered entity structure, risk profile, stakeholders, and current program controls.'],
      ['Evaluate', 'Review records, policies, system logic, registration details, and operational workflows.'],
      ['Prioritize', 'Separate immediate compliance concerns from longer-term optimization opportunities.'],
      ['Support', 'Provide actionable findings, corrective recommendations, and follow-up monitoring.']
    ]
  },
  {
    slug: 'hospital-pharmacy-operations',
    eyebrow: 'OPERATIONS & PERFORMANCE',
    title: 'Hospital Pharmacy Operations',
    short: 'Practical operational support for critical access hospitals and community health systems.',
    summary: 'Turn pharmacy data and frontline experience into measurable improvements in safety, efficiency, cost control, and administrative visibility.',
    outcomes: ['More reliable workflows', 'Stronger KPI reporting', 'Improved staff efficiency', 'Better financial visibility'],
    capabilities: [
      'Department assessments and action plans',
      'Pharmacy KPI and executive dashboard development',
      'Medication-use workflow redesign',
      'Inventory, purchasing, and waste reduction',
      'Charge capture and revenue integrity review',
      'Staffing and responsibility alignment',
      'Policy and procedure modernization',
      'Vendor and technology evaluation'
    ],
    process: [
      ['Assess', 'Map current workflows, responsibilities, systems, constraints, and performance measures.'],
      ['Analyze', 'Use operational and financial data to isolate high-value opportunities.'],
      ['Design', 'Build practical workflows, tools, scorecards, and accountability structures.'],
      ['Implement', 'Support adoption, measurement, and sustained process ownership.']
    ]
  },
  {
    slug: 'regulatory-compliance',
    eyebrow: 'REGULATORY READINESS',
    title: 'USP & Pharmacy Compliance',
    short: 'Policy, tracer, training, and readiness support for medication management and compounding standards.',
    summary: 'Translate complex standards into workflows, documentation, and staff expectations that fit the realities of a smaller hospital pharmacy.',
    outcomes: ['Survey-ready documentation', 'Consistent staff practice', 'Closed compliance gaps', 'Clear evidence of oversight'],
    capabilities: [
      'USP <797>, <800>, and <825> readiness',
      'Medication management tracer development',
      'Policy and procedure gap analysis',
      'Environmental monitoring program review',
      'Competency and training tool development',
      'Mock survey and corrective action planning',
      'Immediate-use and Category 1/2 workflow review',
      'Regulatory documentation organization'
    ],
    process: [
      ['Compare', 'Map current policies and practice against applicable standards and survey expectations.'],
      ['Trace', 'Follow medications, documentation, and staff actions through the real workflow.'],
      ['Correct', 'Build prioritized remediation plans, tools, and revised policies.'],
      ['Validate', 'Recheck implementation and confirm evidence is available for surveyors.']
    ]
  },
  {
    slug: 'clinical-technology',
    eyebrow: 'CLINICAL TECHNOLOGY',
    title: 'Pharmacy Technology Optimization',
    short: 'Pharmacist-led implementation and optimization of EHR, surveillance, dosing, infusion, and dispensing technology.',
    summary: 'Align technology with clinical practice so systems reduce work, support decisions, and generate reliable data instead of adding friction.',
    outcomes: ['Cleaner system configuration', 'Higher-value clinical alerts', 'Improved adoption', 'Better reporting and controls'],
    capabilities: [
      'Cerner CommunityWorks and PharmNet optimization',
      'DA2 report and pharmacy analytics development',
      'Sentri7 rule review and workflow redesign',
      'DoseMeRx implementation and AUC workflows',
      'BD Pyxis ES implementation and optimization',
      'BD Alaris Guardrails build and maintenance',
      'Formulary, charge master, and billing support',
      'Clinical decision support governance'
    ],
    process: [
      ['Define', 'Clarify clinical, operational, reporting, and governance requirements.'],
      ['Build', 'Configure systems and workflows around the intended end state.'],
      ['Test', 'Validate scenarios, data flow, alerts, reports, and user responsibilities.'],
      ['Optimize', 'Measure performance and refine after go-live.']
    ]
  },
  {
    slug: 'revenue-cost-optimization',
    eyebrow: 'FINANCIAL PERFORMANCE',
    title: 'Revenue & Drug Cost Optimization',
    short: 'Pharmacy-focused analysis to improve purchasing, charge capture, reimbursement, and resource use.',
    summary: 'Identify financial leakage and cost-reduction opportunities while preserving patient care, compliance, and operational reliability.',
    outcomes: ['Reduced drug expense', 'Improved charge capture', 'Actionable variance reporting', 'Stronger purchasing controls'],
    capabilities: [
      'Drug spend and utilization analysis',
      'Charge master and billing workflow review',
      'NDC and catalog crosswalk development',
      'Wholesaler contract and purchasing analysis',
      'Waste, returns, and inventory optimization',
      'High-cost medication monitoring',
      '340B savings and opportunity review',
      'Executive-ready financial reporting'
    ],
    process: [
      ['Collect', 'Assemble purchasing, utilization, billing, formulary, and operational data.'],
      ['Reconcile', 'Connect product, NDC, charge, and usage data across systems.'],
      ['Quantify', 'Rank opportunities by financial impact, effort, and compliance risk.'],
      ['Monitor', 'Create repeatable reporting to sustain gains and identify new variance.']
    ]
  }
];

export function getService(slug) {
  return services.find((service) => service.slug === slug);
}
