export const resources = [
  {
    slug: "building-audit-ready-340b-program",
    category: "340B Compliance",
    title: "Five Elements of an Audit-Ready 340B Program",
    excerpt:
      "Audit readiness is not a binder assembled once a year. It is the result of repeatable controls, documented ownership, and routine validation.",
    readTime: "5 min read",
    date: "July 2026",
    updatedAt: "2026-07-29",
    sections: [
      [
        "1. Defined program ownership",
        "Every major program activity should have an accountable owner, a backup, a review frequency, and clear evidence that the review occurred. Governance should extend beyond pharmacy when registration, eligibility, billing, contracting, or patient definition decisions involve other departments.",
      ],
      [
        "2. Current policies that match practice",
        "Policies should describe the workflow that staff actually follow. A policy that is technically comprehensive but operationally inaccurate can create risk because it does not demonstrate effective oversight.",
      ],
      [
        "3. Routine transaction testing",
        "Covered entities should test representative transactions across locations, payers, providers, mixed-use logic, Medicaid billing, and contract pharmacies. Testing should include both eligible and ineligible scenarios.",
      ],
      [
        "4. Reconciled source data",
        "Registration records, provider lists, locations, contracts, accumulator configuration, and claims data should be reviewed together. Material differences should be investigated and documented.",
      ],
      [
        "5. Corrective action follow-through",
        "Findings should have an owner, due date, documented resolution, and validation step. Closing the task is not the same as proving the underlying risk was corrected.",
      ],
    ],
  },
  {
    slug: "pharmacy-dashboard-executive-metrics",
    category: "Pharmacy Operations",
    title: "What Hospital Leaders Need From a Pharmacy Dashboard",
    excerpt:
      "A useful pharmacy dashboard connects clinical and operational work to patient safety, financial stewardship, and organizational priorities.",
    readTime: "4 min read",
    date: "July 2026",
    updatedAt: "2026-07-29",
    sections: [
      [
        "Start with decisions, not available data",
        "The dashboard should help leaders decide where intervention, investment, or escalation is needed. Each metric should have an owner, target, trend, and explanation of material variance.",
      ],
      [
        "Balance financial and clinical measures",
        "Drug expense, 340B savings, charge capture, inventory, and waste should sit alongside antimicrobial stewardship, intervention activity, medication safety, and regulatory readiness.",
      ],
      [
        "Use a limited executive scorecard",
        "A concise scorecard is more useful than a large collection of unprioritized metrics. Supporting detail can remain available for pharmacy management and deeper review.",
      ],
      [
        "Explain the story behind variance",
        "Numbers without context can create the wrong conclusion. The dashboard should identify major drivers, corrective action, and what leadership should expect next.",
      ],
    ],
  },
  {
    slug: "usp-797-readiness-small-hospital",
    category: "Regulatory Readiness",
    title: "A Practical USP <797> Readiness Approach for Smaller Hospitals",
    excerpt:
      "Smaller hospitals need a compliance model that is rigorous, maintainable, and aligned with the compounding activities they actually perform.",
    readTime: "6 min read",
    date: "July 2026",
    updatedAt: "2026-07-29",
    sections: [
      [
        "Define the real scope",
        "Document which preparations and categories are used, where compounding occurs, who performs it, and which beyond-use dating pathways apply. Avoid designing controls for activities the organization does not perform.",
      ],
      [
        "Map each requirement to evidence",
        "For every requirement, identify the policy, log, competency, certification, report, or observation that proves compliance. This creates a practical survey-readiness index.",
      ],
      [
        "Build a calendar of recurring controls",
        "Environmental monitoring, certification, training, competency, cleaning review, and policy review should be visible on one operating calendar with assigned responsibility.",
      ],
      [
        "Use tracers to validate practice",
        "Observe actual hand hygiene, garbing, cleaning, compounding, labeling, storage, and documentation. Staff performance must match written policy.",
      ],
      [
        "Treat findings as system issues",
        "Correcting a missed signature is not enough when the underlying process makes missed documentation likely. Corrective action should address workflow design and accountability.",
      ],
    ],
  },
];

export function getResource(slug) {
  return resources.find((resource) => resource.slug === slug);
}
