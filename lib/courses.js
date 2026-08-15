/* =========================================================
   COURSE CATALOGUE — THE SINGLE SOURCE OF TRUTH

   Edit this file to change the course line-up. Nothing else
   needs to change: the catalogue page, the detail pages, the
   inquiry dropdown and the certificate generator all read
   from here.

   After editing, run:   npm run sync:courses
   That regenerates public/assets/js/courses.js, which is the
   browser-side copy. Never edit that file by hand.

   `courseId` must be unique and must stay stable once a course
   has been published, because issued certificate records store
   it. Changing a courseId does not break an existing
   certificate — the course title is copied into the record at
   the moment of issue — but it does break the link back to the
   catalogue entry.

   status:  ACTIVE | INACTIVE | COMING_SOON
     ACTIVE       listed, enrollable, certificates may be issued
     COMING_SOON  listed, not enrollable, no certificates
     INACTIVE     hidden from the public site entirely

   certificateEligible: whether the certificate generator will
     accept this course. A course that is not eligible cannot be
     selected in the generator, and the server rejects it too.
   ========================================================= */

export const COURSES = [
  {
    courseId: "security-management-fundamentals",
    courseTitle: "Security Management Fundamentals",
    category: "Security Management",
    level: "Foundation",
    duration: "5 weeks",
    price: 2500,
    format: "Online, self-paced, with instructor review",
    status: "ACTIVE",
    certificateEligible: true,
    image: null,
    accent: "navy",
    summary:
      "The management side of security work: planning a security programme, writing the post orders people actually follow, and running a shift that holds together without you standing over it.",
    description:
      "Security Management Fundamentals covers the discipline of running a security function rather than standing a post. You work through how a security programme is planned, staffed and budgeted, how post orders and standard operating procedures are written so that they survive a night shift, and how performance is measured in a way that changes what officers do. The course is written for Philippine practitioners and uses situations drawn from commercial, industrial and residential deployments.",
    learningObjectives: [
      "Plan a security programme around an actual site and its risks",
      "Write post orders and procedures that officers can follow under pressure",
      "Build a deployment and shift roster that survives absences",
      "Set and use performance measures for a security detachment",
      "Prepare and defend a security budget line by line",
      "Conduct a security briefing and a post-incident debrief"
    ],
    modules: [
      "Module 1 — What a security programme is made of",
      "Module 2 — Site survey and requirement setting",
      "Module 3 — Post orders and standard operating procedures",
      "Module 4 — Deployment, rostering and shift handover",
      "Module 5 — Supervision, performance and documentation",
      "Module 6 — Budgeting and reporting to management"
    ],
    audience: [
      "Security supervisors moving into a management role",
      "Detachment commanders and shift-in-charge officers",
      "Operations staff of security agencies",
      "Facility and property managers who oversee a security contract"
    ],
    outcomes: [
      "A written security plan for a site of your choosing",
      "A complete set of post orders you can deploy",
      "A roster model that accounts for leave and absence",
      "A reporting pack you can hand to management"
    ],
    requirements: [
      "No prior formal training is required",
      "Working experience in a security role is helpful but not essential",
      "A device with an internet connection for the online sessions"
    ],
    benefits: [
      "Instructor review of your written security plan",
      "Templates for post orders, rosters and incident reports",
      "Certificate of Completion with QR verification"
    ]
  },

  {
    courseId: "security-operations-and-supervision",
    courseTitle: "Security Operations and Supervision",
    category: "Security Operations",
    level: "Intermediate",
    duration: "6 weeks",
    price: 2800,
    format: "Online, self-paced, with practical assessments",
    status: "ACTIVE",
    certificateEligible: true,
    image: null,
    accent: "blue",
    summary:
      "Day-to-day operational control: access control that holds, patrols that find things, radio discipline, and supervising officers who are not in the room with you.",
    description:
      "Security Operations and Supervision is about the shift itself. It covers access control and visitor management, patrol methods that actually detect something rather than proving attendance, communication and radio discipline, control-room routine, and the supervisory work of correcting an officer without losing them. Each module ends with a scenario you work through and submit.",
    learningObjectives: [
      "Run access control and visitor management without creating a queue",
      "Plan patrol routes and timings that resist prediction",
      "Maintain radio and log discipline across a full shift",
      "Operate a control room and manage CCTV observation duty",
      "Supervise, correct and develop officers on your shift",
      "Take control of the first ten minutes of an incident"
    ],
    modules: [
      "Module 1 — The shift: opening, handover, closing",
      "Module 2 — Access control and visitor management",
      "Module 3 — Patrol planning and observation",
      "Module 4 — Communication, radio and logbook discipline",
      "Module 5 — Control room and CCTV observation",
      "Module 6 — Supervising people, correcting performance",
      "Module 7 — First response and scene control"
    ],
    audience: [
      "Security officers preparing for supervisory duty",
      "Newly appointed shift supervisors",
      "Control room and CCTV operators",
      "Team leaders in guarding operations"
    ],
    outcomes: [
      "Run a shift handover that leaves nothing undocumented",
      "Design a patrol plan for your own site",
      "Correct an officer's performance without escalation",
      "Control the first minutes of an incident scene"
    ],
    requirements: [
      "Basic literacy in English or Filipino for written reports",
      "Some exposure to security duty is recommended",
      "A device with an internet connection"
    ],
    benefits: [
      "Scenario assessments with written feedback",
      "Patrol planning and shift handover templates",
      "Certificate of Completion with QR verification"
    ]
  },

  {
    courseId: "security-risk-management",
    courseTitle: "Security Risk Management",
    category: "Risk and Assessment",
    level: "Advanced",
    duration: "6 weeks",
    price: 3500,
    format: "Online, self-paced, with a site assessment project",
    status: "ACTIVE",
    certificateEligible: true,
    image: null,
    accent: "gold",
    summary:
      "Assess a site properly: identify what is worth protecting, judge threat honestly, find the gaps, and put the cost of a countermeasure next to the cost of the loss it prevents.",
    description:
      "Security Risk Management teaches the assessment discipline that sits underneath every good security decision. You learn to identify and value assets, describe threats without exaggerating them, survey a site for vulnerability, and rate risk in a way that survives challenge from a finance director. The course ends with a full written security risk assessment of a real site, which the instructor reviews.",
    learningObjectives: [
      "Identify and value the assets a site actually needs to protect",
      "Describe threat using evidence rather than assumption",
      "Conduct a structured physical security survey",
      "Rate and rank risk with a defensible method",
      "Select countermeasures and justify their cost",
      "Write a risk assessment that management will act on"
    ],
    modules: [
      "Module 1 — Assets, criticality and consequence",
      "Module 2 — Threat assessment and information sources",
      "Module 3 — Vulnerability and the physical security survey",
      "Module 4 — Rating and ranking risk",
      "Module 5 — Countermeasure selection and cost",
      "Module 6 — Writing and presenting the assessment",
      "Module 7 — Capstone: assess a real site"
    ],
    audience: [
      "Security managers and consultants",
      "Corporate security and facilities staff",
      "Risk, compliance and audit professionals",
      "Agency owners preparing client proposals"
    ],
    outcomes: [
      "A finished risk assessment for a real site",
      "A ranked register of risks with owners",
      "A costed countermeasure recommendation",
      "A presentation that survives a budget meeting"
    ],
    requirements: [
      "Prior security experience or completion of a foundation course",
      "Access to a site you may assess for the capstone",
      "A device with an internet connection"
    ],
    benefits: [
      "Instructor review of your capstone assessment",
      "Survey checklists and risk register templates",
      "Certificate of Completion with QR verification"
    ]
  },

  {
    courseId: "security-investigation-and-reporting",
    courseTitle: "Security Investigation and Report Writing",
    category: "Investigation",
    level: "Intermediate",
    duration: "5 weeks",
    price: 2800,
    format: "Online, self-paced, with written submissions",
    status: "ACTIVE",
    certificateEligible: true,
    image: null,
    accent: "red",
    summary:
      "Handle an internal incident from first report to final document: preserve the scene, interview properly, keep evidence intact, and write a report that stands up when it is read months later.",
    description:
      "Security Investigation and Report Writing covers workplace and facility investigation as it is actually conducted by security staff: theft, policy breach, damage, and incident follow-up. It concentrates on the parts that go wrong most often — a scene disturbed before anyone recorded it, an interview that led the witness, and a report so vague it cannot be used. Written work is marked and returned with comments.",
    learningObjectives: [
      "Preserve and record an incident scene correctly",
      "Plan and conduct a non-leading interview",
      "Take a usable written statement",
      "Maintain continuity of evidence and a clear exhibit log",
      "Separate observation from inference in writing",
      "Produce an incident report and an investigation report"
    ],
    modules: [
      "Module 1 — First response and scene preservation",
      "Module 2 — Planning an investigation",
      "Module 3 — Interviewing witnesses and subjects",
      "Module 4 — Statements, exhibits and continuity",
      "Module 5 — Analysis: what the facts do and do not show",
      "Module 6 — Report writing and presentation of findings"
    ],
    audience: [
      "Security supervisors handling internal incidents",
      "Loss prevention and asset protection staff",
      "HR and compliance officers involved in workplace cases",
      "Investigators new to corporate work"
    ],
    outcomes: [
      "A complete investigation report marked by the instructor",
      "An interview plan you can reuse",
      "An exhibit and continuity log",
      "Reports that separate fact from opinion"
    ],
    requirements: [
      "Competent written English",
      "Experience in a security, HR or compliance role is helpful",
      "A device with an internet connection"
    ],
    benefits: [
      "Marked written submissions with detailed comments",
      "Report, statement and exhibit log templates",
      "Certificate of Completion with QR verification"
    ]
  },

  {
    courseId: "emergency-response-and-crisis-management",
    courseTitle: "Emergency Response and Crisis Management",
    category: "Emergency and Safety",
    level: "Intermediate",
    duration: "5 weeks",
    price: 3000,
    format: "Online, self-paced, with a live exercise walkthrough",
    status: "ACTIVE",
    certificateEligible: true,
    image: null,
    accent: "blue",
    summary:
      "Plan for fire, earthquake, flood, medical emergency and evacuation — then run the drill, find what failed, and fix the plan before it matters.",
    description:
      "Emergency Response and Crisis Management covers the planning and command side of emergencies in Philippine buildings and facilities: fire, earthquake, flooding and severe weather, medical emergency, and building evacuation. It works through the emergency plan itself, the roles people are assigned, how a command post is set up and run, and how a drill is designed so that it exposes problems rather than hiding them.",
    learningObjectives: [
      "Write an emergency plan for a specific building",
      "Assign and brief emergency response roles",
      "Run an evacuation, including assembly and accounting for people",
      "Set up and operate an incident command post",
      "Design a drill that tests the plan honestly",
      "Conduct a post-incident review and revise the plan"
    ],
    modules: [
      "Module 1 — Hazards, exposure and planning assumptions",
      "Module 2 — Building the emergency plan",
      "Module 3 — Roles, briefing and the response team",
      "Module 4 — Evacuation, assembly and accounting",
      "Module 5 — Incident command and communication",
      "Module 6 — Drills, exercises and after-action review"
    ],
    audience: [
      "Security and safety officers with emergency duties",
      "Building administrators and facility staff",
      "Emergency response team members and floor wardens",
      "Anyone responsible for a building evacuation plan"
    ],
    outcomes: [
      "A written emergency plan for your own building",
      "A briefed and assigned response team structure",
      "A drill design with observation points",
      "An after-action review format you can reuse"
    ],
    requirements: [
      "No prior formal training is required",
      "Access to a building or facility for the planning exercises",
      "A device with an internet connection"
    ],
    benefits: [
      "Walkthrough of a full exercise with the instructor",
      "Emergency plan, drill and after-action templates",
      "Certificate of Completion with QR verification"
    ]
  },

  {
    courseId: "loss-prevention-and-asset-protection",
    courseTitle: "Loss Prevention and Asset Protection",
    category: "Loss Prevention",
    level: "Intermediate",
    duration: "4 weeks",
    price: 2500,
    format: "Online, self-paced",
    status: "COMING_SOON",
    certificateEligible: false,
    image: null,
    accent: "gold",
    summary:
      "Retail and warehouse loss: where shrinkage actually comes from, which controls repay their cost, and how to run an apprehension without creating a bigger problem.",
    description:
      "Loss Prevention and Asset Protection looks at shrinkage in retail, warehouse and distribution settings — internal theft, external theft, process failure and paperwork error — and at the controls that reduce it. It covers the legal and procedural care required around apprehension and detention in the Philippines, and the audit routine that keeps a store honest with itself.",
    learningObjectives: [
      "Identify where shrinkage originates in a specific operation",
      "Design stock and cash controls that repay their cost",
      "Run a floor observation and a controlled apprehension",
      "Conduct a loss prevention audit",
      "Work correctly with police and management after an incident",
      "Report loss in terms management can act on"
    ],
    modules: [
      "Module 1 — Sources of loss",
      "Module 2 — Stock, cash and process controls",
      "Module 3 — Floor observation and apprehension procedure",
      "Module 4 — Loss prevention audit",
      "Module 5 — Reporting and working with management"
    ],
    audience: [
      "Retail and warehouse security staff",
      "Loss prevention officers",
      "Store and branch managers",
      "Inventory and audit personnel"
    ],
    outcomes: [
      "A loss profile for your own operation",
      "A control set matched to your losses",
      "An audit checklist you can run monthly",
      "A defensible apprehension procedure"
    ],
    requirements: [
      "Experience in retail, warehouse or security operations",
      "A device with an internet connection"
    ],
    benefits: [
      "Audit checklists and control templates",
      "Certificate of Completion with QR verification"
    ]
  }
];

/* ---------- Helpers used by the API ---------- */

export function courseById(id) {
  return COURSES.find((c) => c.courseId === id) || null;
}

/* The generator, and the server behind it, will only accept a course
   from this list. A course title sent up from a browser is never
   trusted — only a known course id. */
export function certifiableCourses() {
  return COURSES.filter(
    (c) => c.status === "ACTIVE" && c.certificateEligible === true
  );
}

export function isCertifiable(id) {
  return certifiableCourses().some((c) => c.courseId === id);
}

/* Anything a visitor is allowed to select in an inquiry form. */
export function inquirableCourses() {
  return COURSES.filter((c) => c.status !== "INACTIVE");
}
