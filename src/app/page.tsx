'use client';
import { saveAssessment } from './actions';
import React, { useState, useEffect, useRef, useMemo } from 'react';

const CONSTANTS = {
    BASE_MATCH: 88,
    K_SHORTFALL: 30,
    LAMBDA_SURPLUS: 0.6,
    SURPLUS_CAP: 20,
    MIN_WEIGHT: 1,
    DEMAND_FLOOR: 40,
    DEMAND_CEILING: 95,
    DEMAND_SPAN: 55,
    GAP_MIN_SHORTFALL: 12,
    SEVERITY: { critical: { min_weight: 7, min_shortfall: 30 }, material: { min_weight: 4, min_shortfall: 20 } },
    CLOSURE: { P: 0.95, C: 0.4, J1: 0.7, J2: 0.7, J3: 0.7, J4: 1, J5: 1 },
    HYBRID_PATTERN_DELTA: 0.03,
    BANDS: [
      { code: "anchor", min_ffi: 80 },
      { code: "anchor_with_complement", min_ffi: 65 },
      { code: "technical_founder", min_ffi: 50 },
      { code: "contributor_advisor", min_ffi: 35 },
      { code: "no_fit_anchor", min_ffi: 0 }
    ]
  };
  const FOUNDER_DIMENSIONS = [
    { code: "P1", group: "P", label: "Decisiveness Under Incomplete Evidence", base_weight: 4.2 },
    { code: "P2", group: "P", label: "Ambiguity Tolerance", base_weight: 4.6 },
    { code: "P3", group: "P", label: "Long-Horizon Perseverance", base_weight: 4.8 },
    { code: "P4", group: "P", label: "Outcome Orientation", base_weight: 4.4 },
    { code: "P5", group: "P", label: "Risk Exposure Tolerance", base_weight: 3.8 },
    { code: "P6", group: "P", label: "Resilience", base_weight: 4 },
    { code: "P7", group: "P", label: "Proactivity", base_weight: 4.4 },
    { code: "P8", group: "P", label: "Collaborative Authority-Sharing", base_weight: 4.6 },
    { code: "P9", group: "P", label: "Role Identity Flexibility", base_weight: 4.2 },
    { code: "C1", group: "C", label: "Market Translation", base_weight: 5.2 },
    { code: "C2", group: "C", label: "Customer Discovery Discipline", base_weight: 5.4 },
    { code: "C3", group: "C", label: "Capital Strategy & Sequencing", base_weight: 5 },
    { code: "C4", group: "C", label: "IP & Data Strategy", base_weight: 4.4 },
    { code: "C5", group: "C", label: "Regulatory & Standards Navigation", base_weight: 3.8 },
    { code: "C6", group: "C", label: "Team Architecture", base_weight: 4.8 },
    { code: "C7", group: "C", label: "Partner & Ecosystem Orchestration", base_weight: 4.2 },
    { code: "C8", group: "C", label: "Execution & Resource Discipline", base_weight: 5 },
    { code: "J1", group: "J", label: "Domain Credibility", base_weight: 6.2 },
    { code: "J2", group: "J", label: "Buyer-Market Access", base_weight: 5.6 },
    { code: "J3", group: "J", label: "Transition Experience", base_weight: 4.4 },
    { code: "J4", group: "J", label: "Conviction Authenticity", base_weight: 3.5 },
    { code: "J5", group: "J", label: "Commitment Capacity", base_weight: 3.5 }
  ];
  const TRANSLATION_MATRIX = {
    D1_high: { P1: 2, P2: 0.6, P3: 0.6, P4: 2, P7: 1.4, C1: 2, C2: 2, C3: 1.4, C5: 1.4, C6: 1.4, C7: 1.4, C8: 2, J2: 2, J3: 1.4 },
    D1_low: { P2: 2, P3: 2, P4: 0.6, P5: 1.4, P6: 1.4, P9: 1.4, C1: 0.6, C3: 2, C4: 1.4, J1: 2, J2: 0.6 },
    D2: { P2: 2, P3: 2, P5: 1.4, P6: 2, C3: 2, C4: 1.4, J1: 2 },
    D3: { P3: 1.4, P9: 0.6, C4: 1.4, C6: 2, J1: 2, J3: 1.4 },
    D4: { P3: 2, P5: 2, P6: 1.4, P8: 1.4, C3: 2, C6: 1.4, C7: 2, C8: 1.4, J3: 2 },
    D5: { P1: 0.6, P2: 2, P3: 2, P4: 0.6, P5: 2, P6: 2, C3: 2, C4: 1.4, C7: 1.4, J3: 1.4 },
    D6: { P3: 1.4, P6: 1.4, C3: 1.4, C4: 1.4, C5: 2, C7: 1.4, C8: 2, J3: 1.4 },
    D7: { P1: 1.4, P3: 1.4, P6: 1.4, P7: 2, P8: 1.4, C1: 2, C2: 2, C5: 1.4, C7: 2, J2: 2, J3: 1.4 },
    D8: { P2: 1.4, P3: 2, P6: 1.4, P7: 2, C1: 2, C2: 1.4, C3: 2, C5: 1.4, C7: 2, J1: 1.4, J2: 2, J3: 2 },
    D9: { P1: 1.4, C3: 1.4, C4: 2, C7: 1.4, J3: 1.4 },
    D10: { P7: 1.4, P8: 2, C1: 1.4, C4: 1.4, C5: 1.4, C7: 2, J2: 1.4, J3: 1.4 },
    D11: { P7: 1.4, P8: 1.4, C6: 2, C7: 1.4, J1: 1.4 },
    D12: { P1: 2, P2: 2, P4: 1.4, P5: 1.4, P7: 1.4, C1: 2, C2: 2, C8: 1.4, J2: 1.4, J3: 1.4 }
  };
  const GATES = [
    { code: "GATE_COMMITMENT", dimension: "J5", threshold: 60, always_active: true, waivable: false, reason: "Insufficient available time, runway, or freedom from institutional entanglement to lead the venture." },
    { code: "GATE_CONVICTION", dimension: "J4", threshold: 40, always_active: true, waivable: false, reason: "No evidence of interest in this problem predating the opportunity." },
    { code: "GATE_DOMAIN", dimension: "J1", threshold: 60, condition: { asset_dim: "D3", min: 4 }, waivable: false, reason: "This asset requires recognized subfield expertise at the top of the venture." },
    { code: "GATE_BUYER_ACCESS", dimension: "J2", threshold: 45, condition: { asset_dim: "D7", min: 4 }, waivable: true, reason: "Institutional buyers require existing market access; waivable only by naming a complementary co-founder." },
    { code: "GATE_IP_CONFLICT", dimension: null, attestation_required: true, condition: { asset_dim: "D9", min: 4 }, waivable: false, reason: "IP ownership is encumbered; a documented conflict-of-interest review is required." },
    { code: "GATE_VALIDITY", dimension: null, always_active: true, waivable: false, reason: "Assessment response validity could not be established." }
  ];
  const FC_BLOCKS = [
    { code: "B1", statements: [
      { id: "a", dim: "P1", text: "I commit before the evidence is conclusive." },
      { id: "b", dim: "P2", text: "I work productively without a defined method to follow." },
      { id: "c", dim: "P3", text: "I have pursued one goal for years without visible progress." },
      { id: "d", dim: "P4", text: "I judge my work by what it changes, not by how good it is." }
    ] },
    { code: "B2", statements: [
      { id: "a", dim: "P5", text: "I accept personal financial exposure for work I believe in." },
      { id: "b", dim: "P6", text: "Rejection stops affecting me within days." },
      { id: "c", dim: "P7", text: "I approach people before anyone introduces me." },
      { id: "d", dim: "P8", text: "I give others authority over decisions that matter to me." }
    ] },
    { code: "B3", statements: [
      { id: "a", dim: "P9", text: "My sense of who I am does not depend on my technical role." },
      { id: "b", dim: "P1", text: "I would rather decide imperfectly than wait for certainty." },
      { id: "c", dim: "P2", text: "Not knowing whether I am right does not slow me down." },
      { id: "d", dim: "P3", text: "I return to difficult problems for as long as it takes." }
    ] },
    { code: "B4", statements: [
      { id: "a", dim: "P4", text: "Adoption matters more to me than elegance." },
      { id: "b", dim: "P5", text: "I would leave a secure position for an uncertain one." },
      { id: "c", dim: "P6", text: "Setbacks do not change how I behave." },
      { id: "d", dim: "P7", text: "I create opportunities rather than respond to them." }
    ] },
    { code: "B5", statements: [
      { id: "a", dim: "P8", text: "I hire people who will overrule me." },
      { id: "b", dim: "P9", text: "I could spend most of my time outside my specialty." },
      { id: "c", dim: "P1", text: "I make the call when experts disagree." },
      { id: "d", dim: "P2", text: "Undefined problems are the ones I prefer." }
    ] },
    { code: "B6", statements: [
      { id: "a", dim: "P3", text: "I have continued work others would have abandoned." },
      { id: "b", dim: "P4", text: "I track progress against outcomes, not effort." },
      { id: "c", dim: "P5", text: "I can commit resources before knowing the result." },
      { id: "d", dim: "P6", text: "Criticism of my work is not criticism of me." }
    ] },
    { code: "B7", statements: [
      { id: "a", dim: "P7", text: "I ask directly for the meeting, the introduction, the order." },
      { id: "b", dim: "P8", text: "Shared credit satisfies me as much as individual credit." },
      { id: "c", dim: "P9", text: "I would trade professional prestige for practical impact." },
      { id: "d", dim: "P1", text: "I stop revisiting decisions once they are made." }
    ] },
    { code: "B8", statements: [
      { id: "a", dim: "P2", text: "I proceed without external validation of my direction." },
      { id: "b", dim: "P3", text: "Long odds increase my commitment." },
      { id: "c", dim: "P4", text: "I raise the target when I reach it early." },
      { id: "d", dim: "P5", text: "A risky path I control beats a safe one I do not." }
    ] },
    { code: "B9", statements: [
      { id: "a", dim: "P6", text: "I recover from disappointment faster than most people." },
      { id: "b", dim: "P7", text: "I act on problems before they are assigned to me." },
      { id: "c", dim: "P8", text: "I accept a team decision I argued against." },
      { id: "d", dim: "P9", text: "I would describe myself without mentioning credentials." }
    ] },
    { code: "B10", statements: [
      { id: "a", dim: "P1", text: "Slow consensus processes frustrate me." },
      { id: "b", dim: "P2", text: "I hold contradictory hypotheses without discomfort." },
      { id: "c", dim: "P3", text: "I would restart from zero after a total failure." },
      { id: "d", dim: "P4", text: "Being merely adequate at something important is unacceptable to me." }
    ] },
    { code: "B11", statements: [
      { id: "a", dim: "P5", text: "Possible loss does not dominate my decisions." },
      { id: "b", dim: "P6", text: "Pressure does not change my judgment." },
      { id: "c", dim: "P7", text: "I follow up relentlessly without prompting." },
      { id: "d", dim: "P8", text: "I would take a smaller role on a stronger team." }
    ] },
    { code: "B12", statements: [
      { id: "a", dim: "P9", text: "Reinventing myself professionally sounds energizing." },
      { id: "b", dim: "P1", text: "I would rather be wrong than stalled." },
      { id: "c", dim: "P2", text: "I am comfortable with months of no feedback." },
      { id: "d", dim: "P3", text: "My commitment survives long periods of no progress." }
    ] },
    { code: "B13", statements: [
      { id: "a", dim: "P4", text: "I measure myself in results others can verify." },
      { id: "b", dim: "P5", text: "I am willing to be personally accountable for a large bet." },
      { id: "c", dim: "P6", text: "Failure teaches me rather than defines me." },
      { id: "d", dim: "P7", text: "I initiate contact with people far senior to me." }
    ] },
    { code: "B14", statements: [
      { id: "a", dim: "P8", text: "I delegate work I could do better myself." },
      { id: "b", dim: "P9", text: "Stepping back from technical work would not feel like loss." },
      { id: "c", dim: "P1", text: "I decide quickly and correct course later." },
      { id: "d", dim: "P2", text: "I am effective when the process has not been invented yet." }
    ] },
    { code: "B15", statements: [
      { id: "a", dim: "P3", text: "I have never abandoned something that genuinely mattered." },
      { id: "b", dim: "P4", text: "I would sacrifice comfort to reach a goal." },
      { id: "c", dim: "P5", text: "Uncertainty reads as opportunity to me." },
      { id: "d", dim: "P6", text: "I stay composed when others do not." }
    ] },
    { code: "B16", statements: [
      { id: "a", dim: "P7", text: "I make things happen rather than let them happen." },
      { id: "b", dim: "P8", text: "Developing others is worth slowing down for." },
      { id: "c", dim: "P9", text: "I would be content doing work unrelated to my training." },
      { id: "d", dim: "P1", text: "When nobody can tell me the right answer, I still act." }
    ] },
    { code: "B17", statements: [
      { id: "a", dim: "P2", text: "Ambiguous instructions do not frustrate me." },
      { id: "b", dim: "P3", text: "I persist past the point where most people stop." },
      { id: "c", dim: "P4", text: "Recognition matters less to me than measurable change." },
      { id: "d", dim: "P5", text: "I have put my own capital behind my judgment." }
    ] },
    { code: "B18", statements: [
      { id: "a", dim: "P6", text: "Bad news does not alter my working state." },
      { id: "b", dim: "P7", text: "I pursue what I need without waiting for permission." },
      { id: "c", dim: "P8", text: "I structure teams so that I am not the bottleneck." },
      { id: "d", dim: "P9", text: "I would accept a title that understates my expertise." }
    ] }
  ];
  const SCENARIOS = [
    { code: "C1-a", dim: "C1", prompt: "You have fifteen minutes with an operations director who could become your first buyer. You open with:", options: [
      { id: "a", text: "Your performance advantage over existing methods.", score: 0 },
      { id: "b", text: "A question about what currently costs them time, money, or risk.", score: 3 },
      { id: "c", text: "Your validation data and third-party test results.", score: 1 },
      { id: "d", text: "A working demonstration.", score: 2 }
    ] },
    { code: "C1-b", dim: "C1", prompt: "Technical reviewers are impressed; three prospective buyers are lukewarm. The most likely explanation:", options: [
      { id: "a", text: "They do not yet understand the technical significance.", score: 1 },
      { id: "b", text: "Your performance metric is not the metric their budget responds to.", score: 3 },
      { id: "c", text: "You are talking to people too junior to appreciate it.", score: 0 },
      { id: "d", text: "The price is wrong.", score: 1 }
    ] },
    { code: "C2-a", dim: "C2", prompt: "Before committing your next development cycle, the highest-value input is:", options: [
      { id: "a", text: "Fifteen structured conversations with people who would use it daily.", score: 3 },
      { id: "b", text: "A thorough review of published needs assessments in the field.", score: 1 },
      { id: "c", text: "Guidance from your funder or program sponsor on their priorities.", score: 2 },
      { id: "d", text: "A survey distributed through your professional network.", score: 1 }
    ] },
    { code: "C2-b", dim: "C2", prompt: "A prospective user calls your technology \u201Cvery interesting.\u201D You:", options: [
      { id: "a", text: "Log it as validation and proceed.", score: 0 },
      { id: "b", text: "Ask what they do today, what it costs them, and what would make them switch this quarter.", score: 3 },
      { id: "c", text: "Offer an extended free trial.", score: 1 },
      { id: "d", text: "Ask for an introduction to their procurement function.", score: 2 }
    ] },
    { code: "C3-a", dim: "C3", prompt: "You have won three consecutive non-dilutive awards. A colleague suggests two more applications. Your first consideration:", options: [
      { id: "a", text: "Apply \u2014 non-dilutive capital is always worth having.", score: 1 },
      { id: "b", text: "Apply only if the scope moves you toward paying customers; otherwise you are building a grant-consuming organization rather than a company.", score: 3 },
      { id: "c", text: "Stop \u2014 grants are a distraction from real revenue.", score: 0 },
      { id: "d", text: "Apply, but outsource the writing so it costs no founder time.", score: 2 }
    ] },
    { code: "C3-b", dim: "C3", prompt: "An investor offers attractive terms, but your realistic path is institutional sales with twenty-four-month cycles. You:", options: [
      { id: "a", text: "Accept \u2014 capital is capital.", score: 1 },
      { id: "b", text: "Assess whether their fund timeline can survive your revenue timeline, and look first at strategic or mission-aligned capital whose model matches.", score: 3 },
      { id: "c", text: "Refuse equity capital on principle.", score: 1 },
      { id: "d", text: "Accept without foregrounding the sales-cycle reality.", score: 0 }
    ] },
    { code: "C4-a", dim: "C4", prompt: "Your core method was developed partly under institutional auspices. Before raising capital, you:", options: [
      { id: "a", text: "Proceed \u2014 you invented it.", score: 0 },
      { id: "b", text: "Resolve ownership and negotiate the license now, before valuation and diligence raise the price.", score: 3 },
      { id: "c", text: "Re-develop it independently to sidestep the institution.", score: 1 },
      { id: "d", text: "Keep it undisclosed and avoid raising the question.", score: 0 }
    ] },
    { code: "C4-b", dim: "C4", prompt: "Deliverables under a funded program include technical data. You:", options: [
      { id: "a", text: "Mark and assert your retained rights, and track protection periods as a company asset.", score: 3 },
      { id: "b", text: "Deliver everything unrestricted \u2014 it was funded work.", score: 0 },
      { id: "c", text: "Withhold the material portions.", score: 0 },
      { id: "d", text: "Leave it to whoever handles contracts.", score: 1 }
    ] },
    { code: "C5-a", dim: "C5", prompt: "Your technology will operate in a space with certification requirements and possible dual-use implications. Before scaling, you:", options: [
      { id: "a", text: "Scale first; address it when it becomes a problem.", score: 0 },
      { id: "b", text: "Obtain a formal read now and treat clean compliance posture as a sales asset.", score: 3 },
      { id: "c", text: "Restrict scope permanently to avoid the question.", score: 1 },
      { id: "d", text: "Assume institutional counsel covered it during the research phase.", score: 1 }
    ] },
    { code: "C5-b", dim: "C5", prompt: "An institutional buyer asks about your compliance status, which is incomplete. You:", options: [
      { id: "a", text: "Explain that you are small and expect flexibility.", score: 0 },
      { id: "b", text: "Present current status, gaps, and a dated roadmap, and ask which requirements gate a pilot versus full deployment.", score: 3 },
      { id: "c", text: "Represent yourself as nearly compliant to keep the deal alive.", score: 0 },
      { id: "d", text: "Propose routing through a compliant partner instead.", score: 2 }
    ] },
    { code: "C6-a", dim: "C6", prompt: "Advisors tell you your all-technical team needs commercial leadership. You:", options: [
      { id: "a", text: "Recruit a commercial leader as a genuine co-founder with meaningful equity and real authority.", score: 3 },
      { id: "b", text: "Develop the skill yourself.", score: 1 },
      { id: "c", text: "Hire a junior salesperson to execute your direction.", score: 1 },
      { id: "d", text: "Argue that this technology sells on merit.", score: 0 }
    ] },
    { code: "C6-b", dim: "C6", prompt: "Your strongest researcher resists productization and wants to keep publishing. You:", options: [
      { id: "a", text: "Require the transition \u2014 everyone commercializes now.", score: 1 },
      { id: "b", text: "Design an honest split: protected research time, separately staffed productization, explicit publication and IP boundaries.", score: 3 },
      { id: "c", text: "Let them publish freely; visibility helps.", score: 1 },
      { id: "d", text: "Replace them.", score: 1 }
    ] },
    { code: "C7-a", dim: "C7", prompt: "A dominant incumbent could be either your channel or your competitor. You:", options: [
      { id: "a", text: "Avoid them until you are strong enough to compete.", score: 1 },
      { id: "b", text: "Structure a narrow, well-bounded collaboration that creates dependency in your favor while protecting core IP.", score: 3 },
      { id: "c", text: "Pursue acquisition conversations early.", score: 1 },
      { id: "d", text: "Partner broadly and quickly for the credibility.", score: 0 }
    ] },
    { code: "C7-b", dim: "C7", prompt: "Adoption in your market depends on a standard that does not yet accommodate your approach. You:", options: [
      { id: "a", text: "Wait for the standard to evolve.", score: 0 },
      { id: "b", text: "Engage the standards process directly while selling to early adopters who do not require conformance yet.", score: 3 },
      { id: "c", text: "Build to the existing standard and abandon your advantage.", score: 1 },
      { id: "d", text: "Market around the standard and hope buyers overlook it.", score: 0 }
    ] },
    { code: "C8-a", dim: "C8", prompt: "Six months of runway, three plausible priorities, one team. You:", options: [
      { id: "a", text: "Pursue all three at reduced intensity to preserve optionality.", score: 0 },
      { id: "b", text: "Choose the one that most reduces the largest risk to the venture, resource it fully, and set an explicit kill date.", score: 3 },
      { id: "c", text: "Choose the one the team is most excited about.", score: 1 },
      { id: "d", text: "Defer the choice until more information arrives.", score: 0 }
    ] },
    { code: "C8-b", dim: "C8", prompt: "A field trial fails two weeks before a critical review. You:", options: [
      { id: "a", text: "Present the original plan and characterize the failure as a minor setback.", score: 0 },
      { id: "b", text: "Present the failure, what it revealed, the revised approach, and what would confirm or refute it.", score: 3 },
      { id: "c", text: "Postpone the review.", score: 1 },
      { id: "d", text: "Present partial results from the successful subsystems only.", score: 1 }
    ] }
  ];
  const CALIBRATION = [
    { code: "X1", type: "likert", maps_to: "P1", text: "I make major decisions quickly and rarely revisit them." },
    { code: "X2", type: "likert", maps_to: "C2", text: "I have personally interviewed potential buyers or users in the last quarter." },
    { code: "X3", type: "likert", maps_to: "P9", text: "I would step away from technical work entirely if the venture required it." },
    { code: "X4", type: "likert", maps_to: "P2", text: "I am comfortable with six months or more of no external feedback on my progress." },
    { code: "X5", type: "attention", expected: 4, text: "Please select \u201CAgree\u201D for this item." },
    { code: "X6", type: "knowledge_self_report", cross_check: "C4", text: "I understand how data rights and IP ownership work under funded research programs." },
    { code: "X7", type: "infrequency", flag_at: 4, text: "I have never been uncertain about a professional decision." },
    { code: "X8", type: "likert", maps_to: "P8", text: "I would accept a CEO hired above me if it doubled the venture's odds of success." }
  ];
  const CONTEXT_ITEMS = [
    { code: "K1", text: "Years of experience in this technology's domain.", options: ["0-3", "4-7", "8-15", "15+"] },
    { code: "K2", text: "Current position.", options: ["Tenured or tenure-track faculty", "Soft-money researcher", "Government or national lab", "Industry R&D", "Full-time on a venture", "Other"] },
    { code: "K3", text: "Hours per week you could commit within 90 days.", options: ["<10", "10-20", "20-40", "40+"] },
    { code: "K4", text: "Personal financial runway without venture income.", options: ["<3 months", "3-6 months", "6-12 months", "12+ months"] },
    { code: "K5", text: "Have you previously held P&L or management responsibility for a team of 3 or more?", options: ["No", "Under 2 years", "2-5 years", "5+ years"] },
    { code: "K6", text: "Have you previously founded or co-founded a venture?", options: ["No", "Yes, still operating", "Yes, exited", "Yes, closed"] },
    { code: "K7", text: "Geographic mobility.", options: ["Cannot relocate", "Can relocate regionally", "Fully mobile"] },
    { code: "K8", text: "Existing obligations that would constrain the role (institutional, contractual, non-compete).", options: ["None", "Minor", "Significant", "Prohibitive"] },
    { code: "K9", text: "In the last 12 months, how many conversations have you had with potential buyers or operators in this market?", options: ["0", "1-3", "4-10", "10+"] },
    { code: "K10", text: "How long have you been engaged with this specific problem area?", options: ["Since this opportunity arose", "Under 1 year", "1-3 years", "3+ years"] }
  ];
  const ADJACENCY_RUBRIC = [
    { code: "J1", label: "Domain Credibility", anchor_1: "No standing or experience in this specific field.", anchor_3: "Solid working knowledge; credible to practitioners but not to leaders in the field.", anchor_5: "Recognized authority; peers in the subfield would defer to their judgment.", evidence: ["Publications or patents in the subfield", "Recognized roles, awards, invited positions", "Depth of applied experience"] },
    { code: "J2", label: "Buyer-Market Access", anchor_1: "No relationships in this buyer market.", anchor_3: "Some relationships, mostly at influencer rather than decision-maker level.", anchor_5: "Direct, current access to decision-makers at multiple target buyers.", evidence: ["Named relationships and their roles", "Recency of contact", "Evidence of ability to convene a meeting"] },
    { code: "J3", label: "Transition Experience", anchor_1: "No experience moving technology toward market.", anchor_3: "Participated in a transition led by others.", anchor_5: "Personally led a comparable technology across a similar maturity gap, successfully.", evidence: ["Prior ventures or transitions", "Their actual role", "Comparability of TRL gap and capital scale"] },
    { code: "J4", label: "Conviction Authenticity", anchor_1: "Interest appeared with the opportunity.", anchor_3: "Genuine interest, but not previously acted upon.", anchor_5: "Documented, sustained pursuit of this problem predating the opportunity.", evidence: ["Evidence predating the opportunity", "Unpaid or self-directed work on the problem", "Consistency across references"] },
    { code: "J5", label: "Commitment Capacity", anchor_1: "Cannot commit meaningfully within the next year.", anchor_3: "Substantial commitment possible but with real constraints.", anchor_5: "Fully available, unencumbered, financially able to sustain the transition.", evidence: ["Available hours", "Personal runway", "Institutional or contractual entanglements", "Mobility"] }
  ];
  const FIT_PATTERNS = [
    { code: "native_fit", label: "Native Fit", prototype: { P1: 72, P2: 72, P3: 75, P4: 75, P6: 72, P7: 75, P8: 72, P9: 70, C1: 72, C2: 75, C3: 70, C6: 72, C8: 75, J1: 72, J2: 72, J3: 70, J4: 78, J5: 80 }, failure_mode: "Complacency; under-building the team because the founder can cover most functions adequately.", remedy: "Ordinary hiring discipline and explicit succession of functions out of the founder's hands." },
    { code: "discoverer", label: "The Discoverer", prototype: { P3: 85, P2: 70, P8: 22, P9: 20, P4: 40, C1: 35, C2: 32, C6: 30, J1: 92, J4: 88, J2: 30 }, failure_mode: "Solo ceiling \u2014 the venture cannot grow past the founder's personal bandwidth or willingness to delegate.", remedy: "CSO or CTO role with an external anchor founder; authority split documented before formation." },
    { code: "translator", label: "The Translator", prototype: { C1: 88, C2: 85, P7: 78, P9: 80, J2: 85, J1: 25, P3: 55, C4: 45 }, failure_mode: "Overpromises technical maturity; loses credibility with technical buyers and with the research team.", remedy: "Mandated technical co-founder with real authority over technical claims." },
    { code: "steward", label: "The Steward", prototype: { P3: 88, P6: 85, C5: 80, C4: 75, P1: 28, P4: 32, C8: 45, P5: 30 }, failure_mode: "Refinement trap \u2014 perfects the technology past the market window.", remedy: "Hard decision gates with dates; commercially aggressive complement with authority to force ship decisions." },
    { code: "accelerant", label: "The Accelerant", prototype: { P1: 88, P4: 88, P7: 85, P5: 78, P3: 32, C4: 30, C5: 32, P2: 45 }, failure_mode: "Burns through long-cycle assets; takes IP and compliance shortcuts that surface in diligence.", remedy: "Assign to short-cycle assets where possible; otherwise staff IP and regulatory functions independently." },
    { code: "navigator", label: "The Navigator", prototype: { C3: 85, C7: 88, J2: 82, P7: 78, C8: 40, C2: 45, P4: 48 }, failure_mode: "Builds relationships and structures instead of product and revenue.", remedy: "Revenue-gated milestones; partnership activity measured against booked outcomes." },
    { code: "architect", label: "The Architect", prototype: { C6: 88, C8: 82, P8: 85, P1: 70, C2: 45, C3: 50, P5: 42 }, failure_mode: "Over-structures the organization before demand is validated.", remedy: "Headcount discipline tied to validated demand milestones." },
    { code: "adjacent_misfit", label: "Adjacent Misfit", prototype: { P1: 75, P3: 75, P4: 75, P7: 75, C1: 72, C2: 70, C8: 72, J1: 18, J2: 20, J3: 55 }, failure_mode: "Confident, capable execution in the wrong direction for this specific asset and market.", remedy: "Reassign \u2014 check the portfolio matrix. This profile is often excellent against a different asset." },
    { code: "availability_fit", label: "Availability Fit", prototype: { J5: 88, J4: 22, J1: 35, J2: 30, J3: 30, P3: 45, P4: 45, C2: 40 }, failure_mode: "The default appointment. Someone was free, willing, and nearby. Highest-frequency and highest-cost selection error.", remedy: "Do not appoint to the anchor role. Continue the search." }
  ];
  const NORMS = {
    P1: { mean: 50, sd: 16 },
    P2: { mean: 50, sd: 16 },
    P3: { mean: 54, sd: 15 },
    P4: { mean: 52, sd: 16 },
    P5: { mean: 46, sd: 17 },
    P6: { mean: 52, sd: 15 },
    P7: { mean: 50, sd: 16 },
    P8: { mean: 48, sd: 17 },
    P9: { mean: 44, sd: 18 },
    C1: { mean: 52, sd: 22 },
    C2: { mean: 50, sd: 23 },
    C3: { mean: 48, sd: 22 },
    C4: { mean: 46, sd: 24 },
    C5: { mean: 44, sd: 24 },
    C6: { mean: 54, sd: 21 },
    C7: { mean: 48, sd: 22 },
    C8: { mean: 56, sd: 21 }
  };
  const FALLBACK = {
    strength: {
      P1: "Commits to a direction without waiting for conclusive evidence, which this venture will require repeatedly.",
      P2: "Operates effectively without a defined method or external validation of progress.",
      P3: "Sustains effort across long periods without visible results.",
      P4: "Measures work by what it changes rather than by its technical quality.",
      P5: "Tolerates meaningful personal and financial exposure.",
      P6: "Recovers quickly from rejection and failure.",
      P7: "Initiates contact, opportunity, and action without prompting.",
      P8: "Gives real decision authority to others \u2014 unusual and valuable in technical founders.",
      P9: "Willing to be defined by the venture rather than by technical expertise.",
      C1: "Expresses technical capability in terms buyers act on.",
      C2: "Gathers structured evidence directly from buyers and users.",
      C3: "Matches capital type and sequence to the venture's actual physics.",
      C4: "Treats IP position and data rights as company assets requiring active management.",
      C5: "Treats compliance posture as a commercial asset rather than an obstacle.",
      C6: "Designs teams and roles rather than accumulating headcount.",
      C7: "Works effectively through incumbents, integrators, and standards processes.",
      C8: "Converts constrained resources into shipped output with explicit decision gates.",
      J1: "Holds recognized standing in this asset's technical field.",
      J2: "Has direct, current access to decision-makers in this asset's buyer market.",
      J3: "Has personally led a comparable technology across a similar maturity gap.",
      J4: "Engagement with this problem predates the opportunity and is documented.",
      J5: "Fully available and unencumbered for the role."
    },
    gap: {
      P1: "Tends to defer commitment pending further evidence; this venture's decision cadence will exceed that tolerance.",
      P2: "Requires more structure and external validation than this stage will provide.",
      P3: "The venture's timeline to visible results likely exceeds demonstrated persistence.",
      P4: "Orientation toward technical quality over measurable outcome is a mismatch for this asset's stage.",
      P5: "Comfort with personal exposure is below what this venture will demand.",
      P6: "Recovery from setbacks may be slower than the venture's failure rate requires.",
      P7: "Initiative is more responsive than self-starting; this asset requires the latter.",
      P8: "Reluctance to share real decision authority is a structural risk for a venture of this shape.",
      P9: "Identification with the technical role may constrain the transition to venture leadership.",
      C1: "Translating technical capability into buyer value is a development need.",
      C2: "Structured buyer and user evidence-gathering is a development need.",
      C3: "Capital strategy and sequencing is a development need.",
      C4: "IP and data rights strategy is a development need.",
      C5: "Regulatory and standards navigation is a development need.",
      C6: "Team architecture and role design is a development need.",
      C7: "Partner and ecosystem orchestration is a development need.",
      C8: "Execution discipline under resource constraint is a development need.",
      J1: "Standing in this asset's field is below what the venture requires; substitution by a technical co-founder is required.",
      J2: "Access to this asset's buyer market is below requirement; substitution by a commercial co-founder is required.",
      J3: "No comparable transition experience; mitigate with advisors who have done it.",
      J4: "No evidence of engagement with this problem predating the opportunity.",
      J5: "Availability, runway, or entanglements are insufficient for the role."
    }
  };
  const VERSIONS = { content_version: "v1.0.0", algo_version: "1.0.0", norms_version: "provisional-1" };
  const ASSET_DIM_META = [
    { code: "D1", label: "Technical Maturity" },
    { code: "D2", label: "Residual Science Risk" },
    { code: "D3", label: "Expertise Depth Required" },
    { code: "D4", label: "Capital Intensity" },
    { code: "D5", label: "Time to First Revenue" },
    { code: "D6", label: "Regulatory Burden" },
    { code: "D7", label: "Buyer Complexity" },
    { code: "D8", label: "Market Type" },
    { code: "D9", label: "IP Encumbrance" },
    { code: "D10", label: "Ecosystem Dependence" },
    { code: "D11", label: "Technical Talent Scarcity" },
    { code: "D12", label: "Commercialization Model Ambiguity" }
  ];
  const PRESET_ASSETS = [
    {
      id: "sensing",
      name: "Distributed Methane-Leak Sensing Platform",
      domain: "Environmental sensing / industrial monitoring",
      one_sentence: "A field-demonstrated sensor network that detects and localizes methane leaks across pipeline infrastructure in real time.",
      maturity_label: "Prototype demonstrated in a relevant environment",
      buyer_market_label: "Institutional procurement (energy operators, regulators)",
      scores: { D1: 4, D2: 2, D3: 3, D4: 3, D5: 2, D6: 3, D7: 4, D8: 3, D9: 2, D10: 3, D11: 2, D12: 2 }
    },
    {
      id: "biomanufacturing",
      name: "Enzymatic Rare-Earth Recovery Process",
      domain: "Biomanufacturing / critical materials",
      one_sentence: "A lab-validated enzymatic process that recovers rare-earth elements from electronic waste at ambient conditions.",
      maturity_label: "Lab-validated, components integrated",
      buyer_market_label: "Dual-use commercial and public sector",
      scores: { D1: 3, D2: 4, D3: 5, D4: 4, D5: 4, D6: 3, D7: 4, D8: 3, D9: 4, D10: 4, D11: 4, D12: 3 }
    }
  ];
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const round2 = (v) => Math.round(v * 100) / 100;
  function erf(x) {
    const s = x < 0 ? -1 : 1;
    const ax = Math.abs(x);
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    const t = 1 / (1 + p * ax);
    const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
    return s * y;
  }
  const normalCdf = (z) => 0.5 * (1 + erf(z / Math.SQRT2));
  function percentileFromNorm(value, norm) {
    if (!norm || norm.sd === 0) return 50;
    return clamp(round2(normalCdf((value - norm.mean) / norm.sd) * 100), 0.5, 99.5);
  }
  function closureFor(code, C) {
    if (C.CLOSURE[code] !== void 0) return C.CLOSURE[code];
    return C.CLOSURE[code[0]];
  }
  function computeVDP(asset) {
    const C = CONSTANTS;
    const weights = {};
    for (const fd of FOUNDER_DIMENSIONS) weights[fd.code] = fd.base_weight;
    const applyRow = (row, intensity) => {
      if (!row || intensity <= 0) return;
      for (const [dim, mult] of Object.entries(row)) {
        if (weights[dim] === void 0) continue;
        weights[dim] *= 1 + (mult - 1) * intensity;
      }
    };
    for (const [rowKey, row] of Object.entries(TRANSLATION_MATRIX)) {
      if (rowKey.startsWith("_")) continue;
      if (rowKey === "D1_high") {
        applyRow(row, clamp((asset.D1 - 3) / 2, 0, 1));
      } else if (rowKey === "D1_low") {
        applyRow(row, clamp((3 - asset.D1) / 2, 0, 1));
      } else {
        const s = asset[rowKey];
        if (s === void 0) continue;
        const intensity = (s - 3) / 2;
        if (intensity >= 0) applyRow(row, intensity);
        else {
          const inverted = {};
          for (const [dim, mult] of Object.entries(row)) inverted[dim] = 1 / mult;
          applyRow(inverted, -intensity);
        }
      }
    }
    let total = Object.values(weights).reduce((a, b) => a + b, 0);
    for (const k of Object.keys(weights)) weights[k] = weights[k] / total * 100;
    for (const k of Object.keys(weights)) weights[k] = Math.max(C.MIN_WEIGHT, weights[k]);
    total = Object.values(weights).reduce((a, b) => a + b, 0);
    for (const k of Object.keys(weights)) weights[k] = round2(weights[k] / total * 100);
    const drift = round2(100 - Object.values(weights).reduce((a, b) => a + b, 0));
    if (drift !== 0) {
      const largest = Object.entries(weights).sort((a, b) => b[1] - a[1])[0][0];
      weights[largest] = round2(weights[largest] + drift);
    }
    const maxW = Math.max(...Object.values(weights));
    const demand_levels = {};
    for (const [dim, w] of Object.entries(weights)) {
      demand_levels[dim] = Math.round(clamp(C.DEMAND_FLOOR + C.DEMAND_SPAN * (w / maxW), C.DEMAND_FLOOR, C.DEMAND_CEILING));
    }
    const active_gates = GATES.filter((g) => {
      if (g.always_active) return true;
      if (!g.condition) return false;
      return asset[g.condition.asset_dim] >= g.condition.min;
    });
    return { weights, demand_levels, active_gates };
  }
  function scoreForcedChoice(input) {
    const raw = {};
    for (const fd of FOUNDER_DIMENSIONS) if (fd.group === "P") raw[fd.code] = 0;
    const byCode = new Map(FC_BLOCKS.map((b) => [b.code, b]));
    for (const resp of input.forcedChoice) {
      const block = byCode.get(resp.block);
      if (!block || resp.most === resp.least) continue;
      const most = block.statements.find((s) => s.id === resp.most);
      const least = block.statements.find((s) => s.id === resp.least);
      if (!most || !least) continue;
      raw[most.dim] += 2;
      raw[least.dim] -= 1;
    }
    const percentile = {};
    for (const [dim, r] of Object.entries(raw)) {
      const normalized = (r + 8) / 24 * 100;
      percentile[dim] = percentileFromNorm(normalized, NORMS[dim]);
    }
    return { raw, percentile };
  }
  function scoreScenarios(input) {
    const raw = {};
    for (const fd of FOUNDER_DIMENSIONS) if (fd.group === "C") raw[fd.code] = 0;
    const byCode = new Map(SCENARIOS.map((s) => [s.code, s]));
    for (const resp of input.scenarios) {
      const sc = byCode.get(resp.code);
      if (!sc) continue;
      const opt = sc.options.find((o) => o.id === resp.choice);
      if (!opt) continue;
      raw[sc.dim] += opt.score;
    }
    const percentile = {};
    for (const [dim, r] of Object.entries(raw)) {
      percentile[dim] = percentileFromNorm(r / 6 * 100, NORMS[dim]);
    }
    return { raw, percentile };
  }
  function scoreAdjacency(adj) {
    const raw = {}, percentile = {};
    for (const [dim, v] of Object.entries(adj.scores)) {
      raw[dim] = v;
      percentile[dim] = (v - 1) / 4 * 100;
    }
    return { raw, percentile };
  }
  const READING_FLOOR_MS = { forced_choice: 6e3, scenario: 12e3, calibration: 3e3 };
  function runValidityChecks(input, capabilityPercentiles, dispositionPercentiles) {
    const checks = [];
    const calib = new Map(input.calibration.map((c) => [c.code, c.value]));
    for (const item of CALIBRATION) {
      if (item.type === "attention") {
        const v = calib.get(item.code);
        checks.push({ code: "ATTENTION_CHECK", effect: "void", passed: v === item.expected, detail: `expected ${item.expected}, got ${v}` });
      }
      if (item.type === "infrequency") {
        const v = calib.get(item.code) ?? 0;
        checks.push({ code: "INFREQUENCY", effect: "flag", passed: v < (item.flag_at ?? 4), detail: `value ${v}` });
      }
      if (item.type === "knowledge_self_report" && item.cross_check) {
        const v = calib.get(item.code) ?? 0;
        const actual = capabilityPercentiles[item.cross_check] ?? 50;
        checks.push({ code: "INSIGHT_GAP", effect: "annotate", passed: !(v >= 4 && actual < 35), detail: `self-report ${v}, ${item.cross_check} percentile ${actual}` });
      }
    }
    const bySection = {};
    for (const l of input.latencies) (bySection[l.section] ||= []).push(l.latency_ms);
    for (const [section, arr] of Object.entries(bySection)) {
      const floor = READING_FLOOR_MS[section];
      if (!floor || arr.length === 0) continue;
      const sorted = [...arr].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      checks.push({ code: `SPEED_${section.toUpperCase()}`, effect: "void", passed: median >= floor * 0.4, detail: `median ${median}ms vs floor ${floor}ms` });
    }
    const likertVals = CALIBRATION.filter((c) => c.type === "likert").map((c) => calib.get(c.code)).filter((v) => v !== void 0);
    checks.push({ code: "STRAIGHT_LINING", effect: "flag", passed: new Set(likertVals).size > 1, detail: `${likertVals.length} likert items, ${new Set(likertVals).size} distinct values` });
    let divergent = 0;
    for (const item of CALIBRATION) {
      if (item.type !== "likert" || !item.maps_to) continue;
      const selfPct = ((calib.get(item.code) ?? 3) - 1) / 4 * 100;
      const measured = dispositionPercentiles[item.maps_to] ?? 50;
      if (Math.abs(selfPct - measured) > 35) divergent++;
    }
    checks.push({ code: "CROSS_FORMAT_DIVERGENCE", effect: "flag", passed: divergent < 3, detail: `${divergent} divergent dimensions` });
    const voided = checks.some((c) => !c.passed && c.effect === "void");
    const flagCount = checks.filter((c) => !c.passed && c.effect === "flag").length;
    return { status: voided ? "void" : flagCount >= 2 ? "void" : flagCount === 1 ? "flagged" : "clean", checks };
  }
  function matchFitPattern(percentiles) {
    const C = CONSTANTS;
    const dims = FOUNDER_DIMENSIONS.map((d) => d.code);
    const scored = FIT_PATTERNS.map((p) => {
      const a = [], b = [];
      for (const d of dims) {
        a.push((percentiles[d] ?? 50) - 50);
        b.push((p.prototype[d] ?? 50) - 50);
      }
      const dot = a.reduce((s, v, i) => s + v * b[i], 0);
      const na = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
      const nb = Math.sqrt(b.reduce((s, v) => s + v * v, 0));
      return { p, similarity: na === 0 || nb === 0 ? 0 : dot / (na * nb) };
    }).sort((x, y) => y.similarity - x.similarity);
    const availabilityOverride = (percentiles.J5 ?? 0) >= 60 && (percentiles.J4 ?? 0) < 40 && (percentiles.J1 ?? 0) < 60 && (percentiles.J2 ?? 0) < 60 && (percentiles.J3 ?? 0) < 60;
    const chosen = availabilityOverride ? FIT_PATTERNS.find((p) => p.code === "availability_fit") : scored[0].p;
    const similarity = availabilityOverride ? scored.find((s) => s.p.code === "availability_fit")?.similarity ?? 0 : scored[0].similarity;
    const hybrid = !availabilityOverride && scored.length > 1 && scored[0].similarity - scored[1].similarity < C.HYBRID_PATTERN_DELTA ? scored[1].p.code : void 0;
    return { code: chosen.code, label: chosen.label, similarity: round2(similarity), hybrid_with: hybrid, failure_mode: chosen.failure_mode, remedy: chosen.remedy };
  }
  function buildRiskFlags(dimensions, gaps, validity, gates, patternCode) {
    const flags = [];
    const pct = (c) => dimensions.find((d) => d.code === c)?.percentile ?? 50;
    const wt = (c) => dimensions.find((d) => d.code === c)?.weight ?? 0;
    if (pct("P8") < 30 && wt("P8") >= 4)
      flags.push({ code: "SOLO_CEILING", severity: "high", message: "Low willingness to share decision authority on a venture that requires delegated execution.", evidence: [`P8 percentile ${pct("P8")}`, `weight ${wt("P8")}`] });
    if (pct("P9") < 30 && pct("J1") > 70)
      flags.push({ code: "IDENTITY_ANCHOR", severity: "high", message: "Deep domain identity with low role flexibility \u2014 high risk of remaining a scientist in a CEO seat.", evidence: [`P9 ${pct("P9")}`, `J1 ${pct("J1")}`] });
    if (pct("P3") > 80 && pct("P1") < 35)
      flags.push({ code: "REFINEMENT_TRAP", severity: "medium", message: "High persistence with low decisiveness \u2014 pattern associated with perfecting past the market window.", evidence: [`P3 ${pct("P3")}`, `P1 ${pct("P1")}`] });
    if (pct("C3") < 35 && wt("C3") >= 6)
      flags.push({ code: "CAPITAL_TREADMILL", severity: "high", message: "Weak capital sequencing on a venture whose funding path is a primary risk.", evidence: [`C3 ${pct("C3")}`, `weight ${wt("C3")}`] });
    if (pct("C2") < 35 && wt("C2") >= 8)
      flags.push({ code: "DISCOVERY_GAP", severity: "high", message: "Weak buyer-evidence discipline on a venture where buyer understanding is the dominant risk.", evidence: [`C2 ${pct("C2")}`, `weight ${wt("C2")}`] });
    if (pct("C4") < 35 && wt("C4") >= 6)
      flags.push({ code: "IP_EXPOSURE", severity: "medium", message: "Weak IP and data-rights posture on an asset with meaningful encumbrance.", evidence: [`C4 ${pct("C4")}`, `weight ${wt("C4")}`] });
    if (patternCode === "availability_fit")
      flags.push({ code: "AVAILABILITY_APPOINTMENT", severity: "high", message: "Candidate qualifies primarily on availability. This is the most common and most costly founder-selection error.", evidence: [`J5 ${pct("J5")}`, `J4 ${pct("J4")}`, `J1 ${pct("J1")}`] });
    if (validity.status === "flagged")
      flags.push({ code: "VALIDITY_FLAGGED", severity: "medium", message: "Response validity concerns. Interpret disposition scores with caution.", evidence: validity.checks.filter((c) => !c.passed).map((c) => `${c.code}: ${c.detail ?? ""}`) });
    for (const g of gates.filter((x) => x.waived))
      flags.push({ code: `WAIVED_${g.code}`, severity: "medium", message: `${g.code} was waived. ${g.reason}`, evidence: [g.waiver_note ?? "no note recorded"] });
    const structural = gaps.filter((g) => g.routes.includes("structural_block"));
    if (structural.length > 0)
      flags.push({ code: "STRUCTURAL_BLOCK", severity: "high", message: "One or more critical disposition gaps cannot be closed by coaching or hiring.", evidence: structural.map((g) => `${g.dimension} ${g.label}: demand ${g.demand_level}, actual ${g.actual}`) });
    return flags;
  }
  function computeFit(vdp, percentiles, raws, validity, attestations) {
    const C = CONSTANTS;
    const waiverMap = new Map((attestations.waivers ?? []).map((w) => [w.gate_code, w.note]));
    const gates = vdp.active_gates.map((g) => {
      let passed;
      if (g.code === "GATE_VALIDITY") passed = validity.status !== "void";
      else if (g.attestation_required) passed = attestations.ip_conflict_reviewed === true;
      else if (g.dimension && g.threshold !== void 0) passed = (percentiles[g.dimension] ?? 0) >= g.threshold;
      else passed = true;
      const waived = !passed && g.waivable && waiverMap.has(g.code);
      return { code: g.code, dimension: g.dimension, threshold: g.threshold, passed, waived, waiver_note: waived ? waiverMap.get(g.code) : void 0, reason: g.reason };
    });
    const gateFailed = gates.some((g) => !g.passed && !g.waived);
    const dimensions = [];
    for (const fd of FOUNDER_DIMENSIONS) {
      const pct = percentiles[fd.code] ?? 50;
      const demand = vdp.demand_levels[fd.code];
      const weight = vdp.weights[fd.code];
      const shortfall = Math.max(0, demand - pct);
      const surplus = Math.max(0, pct - demand);
      const penalty = Math.min(100, shortfall * shortfall / C.K_SHORTFALL) * closureFor(fd.code, C);
      const bonus = C.LAMBDA_SURPLUS * Math.min(surplus, C.SURPLUS_CAP);
      const dim_score = clamp(C.BASE_MATCH - penalty + bonus, 0, 100);
      dimensions.push({
        code: fd.code,
        group: fd.group,
        label: fd.label,
        raw: round2(raws[fd.code] ?? 0),
        percentile: round2(pct),
        demand_level: demand,
        weight: round2(weight),
        shortfall: round2(shortfall),
        surplus: round2(surplus),
        dim_score: round2(dim_score),
        contribution: round2(weight / 100 * dim_score)
      });
    }
    const alignment = dimensions.reduce((sum, d) => sum + d.contribution, 0);
    const ffi = gateFailed ? 0 : Math.round(alignment);
    const gaps = [];
    for (const d of dimensions) {
      if (d.shortfall < C.GAP_MIN_SHORTFALL) continue;
      const severity = d.weight >= C.SEVERITY.critical.min_weight && d.shortfall >= C.SEVERITY.critical.min_shortfall ? "critical" : d.weight >= C.SEVERITY.material.min_weight && d.shortfall >= C.SEVERITY.material.min_shortfall ? "material" : "minor";
      const routes = [];
      if (d.group === "C") {
        routes.push("coach");
        if (severity === "critical" && d.weight >= 10) routes.push("hire");
      } else if (d.group === "J") {
        if (d.code === "J4" || d.code === "J5") routes.push("blocking");
        else routes.push(severity === "minor" ? "advise" : "co_found");
      } else {
        routes.push(severity === "critical" ? "structural_block" : severity === "material" ? "structural_risk" : "monitor");
      }
      gaps.push({ dimension: d.code, group: d.group, label: d.label, weight: d.weight, demand_level: d.demand_level, actual: d.percentile, shortfall: d.shortfall, severity, routes });
    }
    gaps.sort((a, b) => b.weight * b.shortfall - a.weight * a.shortfall);
    const criticalCount = gaps.filter((g) => g.severity === "critical").length;
    const materialCount = gaps.filter((g) => g.severity === "material").length;
    const band = gateFailed ? "no_fit_anchor" : C.BANDS.find((b) => ffi >= b.min_ffi)?.code ?? "no_fit_anchor";
    let anchor_confidence = 1;
    if (gateFailed) anchor_confidence = 1;
    else if (ffi >= 85 && criticalCount === 0 && validity.status === "clean") anchor_confidence = 5;
    else if (ffi >= 75 && materialCount <= 1 && criticalCount === 0) anchor_confidence = 4;
    else if (ffi >= 65) anchor_confidence = 3;
    else if (ffi >= 50) anchor_confidence = 2;
    const fit_pattern = matchFitPattern(percentiles);
    const risk_flags = buildRiskFlags(dimensions, gaps, validity, gates, fit_pattern.code);
    const complementarity_spec = gaps.filter((g) => g.routes.includes("co_found") || g.routes.includes("structural_block") || g.routes.includes("hire")).map((g) => ({
      dimension: g.dimension,
      min_percentile: Math.min(90, g.demand_level + 5),
      rationale: `${g.label}: venture demands ${g.demand_level}, candidate at ${g.actual}. ` + (g.group === "P" ? "Disposition gap \u2014 not closable by training; requires structural mitigation." : "Requires a named complement or dedicated hire before formation.")
    }));
    return { ...VERSIONS, validity, dimensions, gates, ffi, band, anchor_confidence, fit_pattern, gaps, risk_flags, complementarity_spec };
  }
  function runScoring({ asset, assessment, adjacency, attestations }) {
    const vdp = computeVDP(asset);
    const fc = scoreForcedChoice(assessment);
    const sc = scoreScenarios(assessment);
    const aj = scoreAdjacency(adjacency);
    const percentiles = { ...fc.percentile, ...sc.percentile, ...aj.percentile };
    const raws = { ...fc.raw, ...sc.raw, ...aj.raw };
    const validity = runValidityChecks(assessment, sc.percentile, fc.percentile);
    return { result: computeFit(vdp, percentiles, raws, validity, attestations), vdp };
  }
  function sampleCandidate() {
    const favoredOrder = ["P3", "P7", "P1", "P4", "P6", "P2"];
    const weakOrder = ["P5", "P9", "P8"];
    const forcedChoice = FC_BLOCKS.map((b) => {
      const byDim = (order) => {
        for (const d of order) {
          const st = b.statements.find((s) => s.dim === d);
          if (st) return st.id;
        }
        return null;
      };
      let most = byDim(favoredOrder) ?? b.statements[0].id;
      let least = byDim(weakOrder) ?? b.statements[b.statements.length - 1].id;
      if (most === least) least = b.statements.find((s) => s.id !== most).id;
      return { block: b.code, most, least };
    });
    const goodChoice = (sc) => sc.options.reduce((a, b) => b.score > a.score ? b : a).id;
    const weakChoice = (sc) => sc.options.reduce((a, b) => b.score < a.score ? b : a).id;
    const scenarios = SCENARIOS.map((sc) => ({
      code: sc.code,
      choice: ["C3-a", "C3-b", "C5-a"].includes(sc.code) ? weakChoice(sc) : sc.code === "C5-b" ? sc.options.find((o) => o.score === 2)?.id ?? goodChoice(sc) : goodChoice(sc)
    }));
    const calibration = [
      { code: "X1", value: 4 },
      { code: "X2", value: 4 },
      { code: "X3", value: 2 },
      { code: "X4", value: 4 },
      { code: "X5", value: 4 },
      { code: "X6", value: 4 },
      { code: "X7", value: 1 },
      { code: "X8", value: 3 }
    ];
    const latencies = [
      ...FC_BLOCKS.map((b) => ({ item_code: b.code, section: "forced_choice", latency_ms: 8200 })),
      ...SCENARIOS.map((s) => ({ item_code: s.code, section: "scenario", latency_ms: 15400 })),
      ...CALIBRATION.map((c) => ({ item_code: c.code, section: "calibration", latency_ms: 4100 }))
    ];
    return {
      context: { K1: "8-15", K2: "Industry R&D", K3: "40+", K4: "6-12 months", K5: "2-5 years", K6: "No", K7: "Can relocate regionally", K8: "Minor", K9: "4-10", K10: "1-3 years" },
      forcedChoice,
      scenarios,
      calibration,
      latencies,
      adjacency: { J1: 3, J2: 2, J3: 3, J4: 4, J5: 4 }
    };
  }
  const T = {
    paper: "#F5F6F2",
    surface: "#FFFFFF",
    ink: "#171B21",
    mut: "#5B6371",
    line: "#E1E4DC",
    lineDark: "#C9CDC3",
    accent: "#0E6B54",
    accentSoft: "#E3EFEA",
    amber: "#9A5B00",
    amberSoft: "#F5EAD6",
    red: "#A6271C",
    redSoft: "#F6E3E0",
    plum: "#5B4FC7",
    plumSoft: "#ECEAF9",
    dark: "#12161C",
    darkLine: "#2A313B",
    consoleCard: "#1A2027",
    consoleText: "#E8EBE6",
    consoleMut: "#8B94A1",
    most: "#2FBE8F",
    least: "#D9822B"
  };
  const BAND_LABELS = {
    anchor: "Anchor Founder",
    anchor_with_complement: "Anchor with Complement",
    technical_founder: "Technical Founder",
    contributor_advisor: "Contributor / Advisor",
    no_fit_anchor: "No Fit \u2014 Anchor Role"
  };
  const BAND_DESC = {
    anchor: "Fit to lead this venture as the anchor founder.",
    anchor_with_complement: "Can anchor this venture with a named complement covering specified gaps.",
    technical_founder: "Fit for the technical founder seat alongside an external anchor.",
    contributor_advisor: "Best deployed as a contributor or advisor to this venture, not a founder.",
    no_fit_anchor: "Not a fit for the anchor role on this asset. This is asset-relative \u2014 check other assets in the portfolio."
  };
  const ROUTE_LABELS = {
    coach: "Coachable (90\u2013180 days)",
    co_found: "Cover with co-founder",
    hire: "Dedicated hire",
    advise: "Advisor coverage",
    blocking: "Blocking \u2014 not substitutable",
    structural_block: "Structural block",
    structural_risk: "Structural risk \u2014 design around",
    monitor: "Monitor"
  };
  const LIKERT = ["Strongly disagree", "Disagree", "Neutral", "Agree", "Strongly agree"];
  function Eyebrow({ children }) {
    return /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: T.mut } }, children);
  }
  function ProgressTimer({ complete, total, seconds, max }) {
    const urgent = seconds <= 10;
    return /* @__PURE__ */ React.createElement("div", { style: { margin: "0 0 22px" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10, fontFamily: "'IBM Plex Mono', monospace" } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: T.consoleMut } }, "measurement in progress \xB7 ", Math.round(complete / total * 100), "% complete"), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 20, fontWeight: 600, color: urgent ? "#F2A69E" : T.most } }, seconds, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 12, color: T.consoleMut } }, "s"))), /* @__PURE__ */ React.createElement("div", { "aria-hidden": true, style: { display: "flex", gap: 3, alignItems: "flex-end", height: 14 } }, Array.from({ length: max }).map((_, i) => /* @__PURE__ */ React.createElement("div", { key: i, style: {
      flex: 1,
      minWidth: 1,
      height: i % 5 === 0 ? 14 : 8,
      borderRadius: 1,
      background: i < seconds ? urgent ? "#C4574A" : T.most : T.darkLine,
      opacity: i < seconds ? 0.9 : 1,
      transition: "background .3s"
    } }))));
  }
  function Console({ children }) {
    return /* @__PURE__ */ React.createElement("div", { style: { background: T.dark, border: `1px solid ${T.darkLine}`, borderRadius: 14, padding: "24px 24px 28px", color: T.consoleText } }, children);
  }
  function Ticks() {
    return /* @__PURE__ */ React.createElement("div", { "aria-hidden": true, style: { display: "flex", gap: 7, alignItems: "flex-end", height: 14, overflow: "hidden" } }, Array.from({ length: 60 }).map((_, i) => /* @__PURE__ */ React.createElement("div", { key: i, style: { width: 1, height: i % 5 === 0 ? 14 : 7, background: i % 5 === 0 ? T.lineDark : T.line, flex: "0 0 auto" } })));
  }
  function Btn({ children, onClick, kind = "primary", disabled, small }) {
    const base = {
      fontFamily: "'IBM Plex Sans', sans-serif",
      fontWeight: 600,
      cursor: disabled ? "not-allowed" : "pointer",
      borderRadius: 6,
      padding: small ? "8px 14px" : "12px 22px",
      fontSize: small ? 13 : 15,
      border: "1px solid",
      transition: "opacity .15s",
      opacity: disabled ? 0.45 : 1
    };
    const kinds = {
      primary: { background: T.ink, color: "#fff", borderColor: T.ink },
      accent: { background: T.accent, color: "#fff", borderColor: T.accent },
      ghost: { background: "transparent", color: T.ink, borderColor: T.lineDark }
    };
    return /* @__PURE__ */ React.createElement("button", { onClick, disabled, style: { ...base, ...kinds[kind] } }, children);
  }
  function ReadoutBar({ percentile, demand, group }) {
    const shortfall = Math.max(0, demand - percentile);
    const barColor = shortfall === 0 ? T.accent : shortfall >= 30 ? T.red : shortfall >= 20 ? T.amber : "#7A828F";
    return /* @__PURE__ */ React.createElement("div", { style: { position: "relative", height: 20, background: "#EDEFE9", borderRadius: 3, overflow: "visible" } }, /* @__PURE__ */ React.createElement("div", { style: { position: "absolute", inset: 0, borderRadius: 3, overflow: "hidden" } }, /* @__PURE__ */ React.createElement("div", { style: { position: "absolute", left: 0, top: 0, bottom: 0, width: `${percentile}%`, background: barColor, opacity: 0.85, borderRadius: 3 } })), /* @__PURE__ */ React.createElement("div", { title: `demand ${demand}`, style: { position: "absolute", left: `${demand}%`, top: -4, bottom: -4, width: 2, background: T.ink } }));
  }
  function FounderFitAssessment() {
    const [step, setStep] = useState("intro");
    const [assetId, setAssetId] = useState(PRESET_ASSETS[0].id);
    const [assetScores, setAssetScores] = useState({ ...PRESET_ASSETS[0].scores });
    const [candidateName, setCandidateName] = useState("");
    const [context, setContext] = useState({});
    const [fcAnswers, setFcAnswers] = useState({});
    const [scAnswers, setScAnswers] = useState({});
    const [calAnswers, setCalAnswers] = useState({});
    const [adjScores, setAdjScores] = useState({ J1: 3, J2: 3, J3: 3, J4: 3, J5: 3 });
    const [ipReviewed, setIpReviewed] = useState(false);
    const [waiverNote, setWaiverNote] = useState("");
    const [idx, setIdx] = useState(0);
    const [latencies, setLatencies] = useState([]);
    const [output, setOutput] = useState(null);
    const [audience, setAudience] = useState("decision_maker");
    const [narrative, setNarrative] = useState(null);
    const [narrLoading, setNarrLoading] = useState(false);
    const [narrError, setNarrError] = useState(null);
    const mountTime = useRef(Date.now());
    const QUESTION_SECONDS = 60;
    const [timeLeft, setTimeLeft] = useState(QUESTION_SECONDS);
    const advancing = useRef(false);
    const asset = PRESET_ASSETS.find((a) => a.id === assetId);
    const vdpPreview = useMemo(() => computeVDP(assetScores), [assetScores]);
    const ipGateActive = assetScores.D9 >= 4;
    const buyerGateActive = assetScores.D7 >= 4;
    useEffect(() => {
      mountTime.current = Date.now();
    }, [step, idx]);
    useEffect(() => {
      setTimeLeft(QUESTION_SECONDS);
      advancing.current = false;
    }, [step, idx]);
    const advanceFc = () => {
      if (advancing.current) return;
      advancing.current = true;
      recordLatency(FC_BLOCKS[idx].code, "forced_choice");
      if (idx + 1 < FC_BLOCKS.length) setIdx(idx + 1);
      else {
        setStep("scen");
        setIdx(0);
      }
    };
    const advanceScen = () => {
      if (advancing.current) return;
      advancing.current = true;
      recordLatency(SCENARIOS[idx].code, "scenario");
      if (idx + 1 < SCENARIOS.length) setIdx(idx + 1);
      else {
        setStep("calib");
        setIdx(0);
      }
    };
    const advanceCalib = () => {
      if (advancing.current) return;
      advancing.current = true;
      recordLatency(CALIBRATION[idx].code, "calibration");
      if (idx + 1 < CALIBRATION.length) setIdx(idx + 1);
      else setStep("adjacency");
    };
    useEffect(() => {
      if (!["fc", "scen", "calib"].includes(step)) return;
      if (timeLeft <= 0) {
        if (step === "fc") advanceFc();
        else if (step === "scen") advanceScen();
        else advanceCalib();
        return;
      }
      const t = setTimeout(() => setTimeLeft((s) => s - 1), 1e3);
      return () => clearTimeout(t);
    });
    useEffect(() => {
      const el = document.getElementById("ff-fonts");
      if (!el) {
        const link = document.createElement("link");
        link.id = "ff-fonts";
        link.rel = "stylesheet";
        link.href = "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap";
        document.head.appendChild(link);
      }
    }, []);
    const recordLatency = (item_code, section) => {
      const latency_ms = Date.now() - mountTime.current;
      setLatencies((prev) => [...prev, { item_code, section, latency_ms }]);
    };
    const finish = (adjOverride, extra = {}) => {
      const assessment = {
        forcedChoice: FC_BLOCKS.map((b) => ({ block: b.code, ...(extra.fc ?? fcAnswers)[b.code] })).filter((r) => r.most && r.least && r.most !== r.least),
        scenarios: SCENARIOS.map((s) => ({ code: s.code, choice: (extra.sc ?? scAnswers)[s.code] })).filter((r) => r.choice),
        calibration: CALIBRATION.map((c) => ({ code: c.code, value: (extra.cal ?? calAnswers)[c.code] })).filter((r) => r.value !== void 0),
        latencies: extra.lat ?? latencies
      };
      const attestations = {
        ip_conflict_reviewed: ipGateActive ? ipReviewed : void 0,
        waivers: buyerGateActive && waiverNote.trim() ? [{ gate_code: "GATE_BUYER_ACCESS", note: waiverNote.trim() }] : []
      };
      const out = runScoring({ asset: assetScores, assessment, adjacency: { scores: adjOverride ?? adjScores }, attestations });
      setOutput(out);
      setNarrative(null);
      setNarrError(null);
      setStep("results");
      
      // Save to database
      saveAssessment(candidateName, asset.name, out.result.ffi, out.result.band, out).then(res => {
        if (res.success) {
          console.log("Saved assessment to DB with ID:", res.id);
        } else {
          console.error("Error saving assessment:", res.error);
        }
      });
    };
    const autofill = () => {
      const s = sampleCandidate();
      setCandidateName(candidateName || "Sample Candidate");
      setContext(s.context);
      const fc = {};
      for (const r of s.forcedChoice) fc[r.block] = { most: r.most, least: r.least };
      setFcAnswers(fc);
      const sc = {};
      for (const r of s.scenarios) sc[r.code] = r.choice;
      setScAnswers(sc);
      const cal = {};
      for (const r of s.calibration) cal[r.code] = r.value;
      setCalAnswers(cal);
      setLatencies(s.latencies);
      setAdjScores(s.adjacency);
      setWaiverNote(buyerGateActive ? "Commercial co-founder identified: former VP Ops at a target operator, with current decision-maker access." : "");
      finish(s.adjacency, { fc, sc, cal, lat: s.latencies });
    };
    const generateNarrative = async () => {
      if (!output) return;
      setNarrLoading(true);
      setNarrError(null);
      const vdp = output.vdp;
      const top_demands = Object.entries(vdp.weights).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([code, weight]) => ({ code, label: FOUNDER_DIMENSIONS.find((d) => d.code === code)?.label, weight, demand_level: vdp.demand_levels[code] }));
      const asset_context = {
        name: asset.name,
        domain: asset.domain,
        one_sentence_description: asset.one_sentence,
        maturity_label: asset.maturity_label,
        buyer_market_label: asset.buyer_market_label,
        top_demands
      };
      const system = `You are the narrative writer for FounderFit, an instrument that evaluates how well a specific person fits a specific technology venture. All scoring has already been completed deterministically. Your only job is to write clear prose that explains results you are given.

WHAT FOUNDERFIT MEASURES

FounderFit is a two-sided match. An asset \u2014 a discovered technology or piece of IP \u2014 is characterized first, and that characterization produces a demand profile: what this particular venture will require of whoever leads it. The candidate is then scored against that demand profile, not against a general standard.

This means a low score on a dimension is not a statement about the person. It is a statement about the relationship between this person and this asset. The same person may be an excellent match for a different technology. Write accordingly, always.

Dimensions fall into three groups, and the distinction between them is the single most important thing your writing must convey:

 DISPOSITION (P1-P9) \u2014 stable characteristics. These do not meaningfully change on venture timescales. A disposition gap is a structural fact to design around, never a development goal. Never suggest someone "work on" a disposition gap.

 CAPABILITY (C1-C8) \u2014 learnable competencies. These close in 90 to 180 days with structured support. Always frame these as development, never as deficiency.

 ADJACENCY (J1-J5) \u2014 asset-relative position: domain standing, market access, transition experience, authenticity of conviction, and available capacity. These do not change quickly, but J1, J2, and J3 can be substituted by a co-founder or hire. J4 and J5 cannot be substituted by anyone.

HARD RULES

1. Never state, imply, or compute a number that does not appear in the input JSON. Do not round, average, convert, or estimate. If you want to express magnitude without a supplied number, use words.
2. Never contradict the computed band, gate results, fit pattern, or gap routing. If a gate failed, the person is not the anchor founder for this asset. Do not soften that into a maybe.
3. Never use clinical, diagnostic, or psychological-disorder language. This is not a psychological assessment and must never read like one.
4. Never infer or reference age, gender, ethnicity, nationality, religion, disability, or health. Not even indirectly.
5. Never recommend hiring, firing, promotion, or compensation. You describe fit and configuration; employment decisions belong to people.
6. Never invent evidence. Every claim traces to a dimension score, a gap, a risk flag, or the asset context you were given.
7. If validity status is "flagged", say so plainly in the assessment section and note that disposition scores should be read with caution.
8. Do not describe the scoring mechanics, weights, formulas, or this instrument's internal structure to a candidate audience.

VOICE

Direct, specific, and respectful. Write as a serious analyst would write for a serious reader. Concrete over abstract. No hedging stacks. No inflation. No filler openers. Do not address the reader as "you" in decision-maker reports; use the candidate's name or "the candidate."

Above all: be honest. A report that flatters a bad match causes a venture to fail slowly and expensively. The most valuable thing this instrument produces is an uncomfortable finding delivered clearly.`;
      const { vdp: _omit, ...scoreOnly } = output;
      const user = `Write the FounderFit report narrative.

AUDIENCE: ${audience}

CANDIDATE NAME: ${candidateName || "The candidate"}

ASSET CONTEXT:
${JSON.stringify(asset_context, null, 2)}

SCORE RESULT:
${JSON.stringify(scoreOnly.result, null, 2)}

Write these sections, each under a plain heading: Executive Summary (3-5 sentences), Strengths Against This Asset, Development Priorities (capabilities only), Structural Considerations (dispositions and adjacency), Fit Pattern and Failure Mode, Recommended Configuration. Keep the whole narrative under 700 words.`;
      try {
        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1e3, temperature: 0.3, system, messages: [{ role: "user", content: user }] })
        });
        const data = await response.json();
        const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
        if (!text) throw new Error("Empty response");
        setNarrative(text);
      } catch (e) {
        setNarrError("Narrative generation unavailable \u2014 showing the deterministic fallback narrative below (per spec, reports still generate when the LLM is down).");
        setNarrative(null);
      }
      setNarrLoading(false);
    };
    const handleBack = () => {
      if (step === "asset") setStep("intro");
      else if (step === "context") setStep("asset");
      else if (step === "fc") {
        if (idx > 0) setIdx(idx - 1);
        else setStep("context");
      }
      else if (step === "scen") {
        if (idx > 0) setIdx(idx - 1);
        else { setStep("fc"); setIdx(FC_BLOCKS.length - 1); }
      }
      else if (step === "calib") {
        if (idx > 0) setIdx(idx - 1);
        else { setStep("scen"); setIdx(SCENARIOS.length - 1); }
      }
      else if (step === "adjacency") {
        setStep("calib"); setIdx(CALIBRATION.length - 1);
      }
      else if (step === "results") setStep("adjacency");
    };
    const shell = (children, { wide } = {}) => /* @__PURE__ */ React.createElement("div", { style: { minHeight: "100vh", background: T.paper, color: T.ink, fontFamily: "'IBM Plex Sans', sans-serif" } }, /* @__PURE__ */ React.createElement("div", { className: "no-print", style: { borderBottom: `1px solid ${T.line}`, background: T.surface } }, /* @__PURE__ */ React.createElement("div", { className: "shell-header no-print", style: { maxWidth: wide ? 1060 : 760, margin: "0 auto", padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "baseline", gap: 10 } }, /* @__PURE__ */ React.createElement("button", { onClick: () => setStep("intro"), style: { background: "none", border: "none", padding: 0, cursor: "pointer", color: "inherit", display: "flex", alignItems: "baseline" } }, /* @__PURE__ */ React.createElement("span", { style: { fontWeight: 700, fontSize: 16, letterSpacing: "-0.01em" } }, "FounderFit", /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10, verticalAlign: "super" } }, "™"))), /* @__PURE__ */ React.createElement("span", { style: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: T.mut } }, "ScienceWerx · algo ", VERSIONS.algo_version, " · content ", VERSIONS.content_version)), step !== "intro" && /* @__PURE__ */ React.createElement("div", { style: { display: 'flex', gap: '8px' } }, /* @__PURE__ */ React.createElement("button", { onClick: handleBack, style: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: T.mut, background: "none", border: `1px solid ${T.line}`, borderRadius: 4, padding: "4px 10px", cursor: "pointer" } }, "← Back"), step !== "results" && /* @__PURE__ */ React.createElement("button", { onClick: autofill, style: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: T.mut, background: "none", border: `1px solid ${T.line}`, borderRadius: 4, padding: "4px 10px", cursor: "pointer" } }, "auto-fill sample →"), step === "results" && /* @__PURE__ */ React.createElement("button", { onClick: () => window.print(), style: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: T.ink, background: T.accentSoft, border: `1px solid ${T.accent}`, borderRadius: 4, padding: "4px 10px", cursor: "pointer" } }, "↓ Save PDF")))), /* @__PURE__ */ React.createElement("div", { className: "shell-container", style: { maxWidth: wide ? 1060 : 760, margin: "0 auto", padding: "36px 20px 80px" } }, children));
    if (step === "intro") {
      return shell(
        /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement(Ticks, null), /* @__PURE__ */ React.createElement("div", { style: { marginTop: 28 } }, /* @__PURE__ */ React.createElement(Eyebrow, null, "Two-sided founder\u2013asset matching"), /* @__PURE__ */ React.createElement("h1", { style: { fontSize: 40, lineHeight: 1.12, fontWeight: 700, letterSpacing: "-0.02em", margin: "14px 0 18px", maxWidth: 640 } }, "Not ", /* @__PURE__ */ React.createElement("em", { style: { fontStyle: "italic", color: T.accent } }, "\u201Cis this person a founder?\u201D"), /* @__PURE__ */ React.createElement("br", null), "but ", /* @__PURE__ */ React.createElement("em", { style: { fontStyle: "italic", color: T.accent } }, "\u201Cis this person the founder for this technology?\u201D")), /* @__PURE__ */ React.createElement("p", { style: { fontSize: 16, lineHeight: 1.65, color: T.mut, maxWidth: 620 } }, "This assessment evaluates a candidate against a specific, already-validated technology asset \u2014 one they did not invent and do not own. The asset's profile determines what the venture demands; the candidate is measured against that demand, not against a general standard. The output identifies talents, development priorities, structural considerations, and \u2014 when it is the honest answer \u2014 misfit for the anchor role."), /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, margin: "30px 0" } }, [
          ["01 \xB7 Disposition", "18 timed questions, 60 seconds each. Pick the statement most and least like you. Stable traits \u2014 designed around, never trained."],
          ["02 \xB7 Capability", "16 timed situational judgments. Learnable competencies that close in 90\u2013180 days with support."],
          ["03 \xB7 Adjacency", "Assessor-rated position relative to this asset: standing, access, experience, conviction, capacity."]
        ].map(([t, d]) => /* @__PURE__ */ React.createElement("div", { key: t, style: { background: T.surface, border: `1px solid ${T.line}`, borderRadius: 8, padding: 18 } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, fontWeight: 600, marginBottom: 8 } }, t), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 13, lineHeight: 1.55, color: T.mut } }, d)))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement(Btn, { kind: "accent", onClick: () => setStep("asset") }, "Begin assessment"), /* @__PURE__ */ React.createElement(Btn, { kind: "ghost", onClick: autofill }, "Run sample candidate")), /* @__PURE__ */ React.createElement("p", { style: { marginTop: 26, fontSize: 12, color: T.mut, fontFamily: "'IBM Plex Mono', monospace", lineHeight: 1.6 } }, "Prototype note: scoring runs in-browser here for demonstration. Production scoring is server-side only, per the build contract.")))
      );
    }
    if (step === "asset") {
      return shell(
        /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement(Eyebrow, null, "Step 1 of 6 \u2014 The validated asset"), /* @__PURE__ */ React.createElement("h2", { style: { fontSize: 26, fontWeight: 700, margin: "10px 0 6px" } }, "What is this candidate being matched to?"), /* @__PURE__ */ React.createElement("p", { style: { color: T.mut, fontSize: 14, lineHeight: 1.6, maxWidth: 620 } }, "The asset is characterized first. Its profile produces the demand weights and target levels the candidate will be scored against, and determines which gates are active."), /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14, margin: "22px 0" } }, PRESET_ASSETS.map((a) => /* @__PURE__ */ React.createElement(
          "button",
          {
            key: a.id,
            onClick: () => {
              setAssetId(a.id);
              setAssetScores({ ...a.scores });
            },
            style: { textAlign: "left", background: T.surface, border: `2px solid ${assetId === a.id ? T.accent : T.line}`, borderRadius: 8, padding: 18, cursor: "pointer" }
          },
          /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 600, fontSize: 15, marginBottom: 6 } }, a.name),
          /* @__PURE__ */ React.createElement("div", { style: { fontSize: 13, color: T.mut, lineHeight: 1.55 } }, a.one_sentence),
          /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: T.mut, marginTop: 10 } }, a.maturity_label, " \xB7 ", a.buyer_market_label)
        ))), /* @__PURE__ */ React.createElement("details", { style: { background: T.surface, border: `1px solid ${T.line}`, borderRadius: 8, padding: "14px 18px", marginBottom: 22 } }, /* @__PURE__ */ React.createElement("summary", { style: { cursor: "pointer", fontWeight: 600, fontSize: 14 } }, "Adjust the asset profile (12 dimensions, 1\u20135)"), /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 12, marginTop: 14 } }, ASSET_DIM_META.map((d) => /* @__PURE__ */ React.createElement("label", { key: d.code, style: { fontSize: 12.5 } }, /* @__PURE__ */ React.createElement("span", { style: { fontFamily: "'IBM Plex Mono', monospace", color: T.mut } }, d.code), " ", d.label, /* @__PURE__ */ React.createElement(
          "select",
          {
            value: assetScores[d.code],
            onChange: (e) => setAssetScores({ ...assetScores, [d.code]: Number(e.target.value) }),
            style: { display: "block", width: "100%", marginTop: 4, padding: "6px 8px", border: `1px solid ${T.line}`, borderRadius: 5, fontSize: 13, background: "#fff" }
          },
          [1, 2, 3, 4, 5].map((v) => /* @__PURE__ */ React.createElement("option", { key: v, value: v }, v))
        ))))), /* @__PURE__ */ React.createElement("div", { style: { background: T.dark, color: "#E8EBE6", borderRadius: 8, padding: 20, marginBottom: 24 } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "#8B94A1", marginBottom: 12 } }, "Derived demand profile \u2014 top demands on the founder"), /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gap: 8 } }, Object.entries(vdpPreview.weights).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([code, w]) => {
          const d = FOUNDER_DIMENSIONS.find((x) => x.code === code);
          return /* @__PURE__ */ React.createElement("div", { key: code, style: { display: "grid", gridTemplateColumns: "44px 1fr 120px", gap: 10, alignItems: "center", fontSize: 13 } }, /* @__PURE__ */ React.createElement("span", { style: { fontFamily: "'IBM Plex Mono', monospace", color: "#8B94A1" } }, code), /* @__PURE__ */ React.createElement("span", null, d.label), /* @__PURE__ */ React.createElement("span", { style: { fontFamily: "'IBM Plex Mono', monospace", textAlign: "right", color: "#B9C1CC" } }, "w ", w.toFixed(1), " \xB7 demand ", vdpPreview.demand_levels[code]));
        })), /* @__PURE__ */ React.createElement("div", { style: { marginTop: 14, fontSize: 12, color: "#8B94A1" } }, "Active gates: ", vdpPreview.active_gates.map((g) => g.code.replace("GATE_", "")).join(" \xB7 "))), /* @__PURE__ */ React.createElement("label", { style: { display: "block", marginBottom: 20, maxWidth: 380 } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 13, fontWeight: 600 } }, "Candidate name"), /* @__PURE__ */ React.createElement(
          "input",
          {
            value: candidateName,
            onChange: (e) => setCandidateName(e.target.value),
            placeholder: "e.g. Dr. Amina Farouk",
            style: { display: "block", width: "100%", marginTop: 6, padding: "10px 12px", border: `1px solid ${T.lineDark}`, borderRadius: 6, fontSize: 14, background: "#fff" }
          }
        )), /* @__PURE__ */ React.createElement(Btn, { kind: "accent", onClick: () => {
          setStep("context");
          setIdx(0);
        } }, "Continue to candidate context")),
        { wide: true }
      );
    }
    if (step === "context") {
      const answered = CONTEXT_ITEMS.filter((k) => context[k.code]).length;
      return shell(
        /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement(Eyebrow, null, "Step 2 of 6 \u2014 Context \xB7 ", answered, "/", CONTEXT_ITEMS.length), /* @__PURE__ */ React.createElement("h2", { style: { fontSize: 24, fontWeight: 700, margin: "10px 0 4px" } }, "About your situation"), /* @__PURE__ */ React.createElement("p", { style: { color: T.mut, fontSize: 14, marginBottom: 24 } }, "These frame the adjacency evaluation and are visible to the assessor. There are no right answers."), /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gap: 16 } }, CONTEXT_ITEMS.map((k) => /* @__PURE__ */ React.createElement("div", { key: k.code, style: { background: T.surface, border: `1px solid ${T.line}`, borderRadius: 8, padding: 16 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 14, fontWeight: 500, marginBottom: 10 } }, /* @__PURE__ */ React.createElement("span", { style: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: T.mut, marginRight: 8 } }, k.code), k.text), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 8 } }, k.options.map((o) => /* @__PURE__ */ React.createElement(
          "button",
          {
            key: o,
            onClick: () => setContext({ ...context, [k.code]: o }),
            style: { padding: "7px 13px", borderRadius: 20, fontSize: 13, cursor: "pointer", border: `1px solid ${context[k.code] === o ? T.accent : T.line}`, background: context[k.code] === o ? T.accentSoft : "#fff", color: T.ink }
          },
          o
        )))))), /* @__PURE__ */ React.createElement("div", { style: { marginTop: 26 } }, /* @__PURE__ */ React.createElement(Btn, { kind: "accent", disabled: answered < CONTEXT_ITEMS.length, onClick: () => {
          setStep("fc");
          setIdx(0);
        } }, "Continue to Section 1 \u2014 Disposition")))
      );
    }
    if (step === "fc") {
      const block = FC_BLOCKS[idx];
      const ans = fcAnswers[block.code] ?? {};
      const pick = (field, id) => {
        const next = { ...ans, [field]: id };
        if (next.most === next.least) delete next[field === "most" ? "least" : "most"];
        setFcAnswers({ ...fcAnswers, [block.code]: next });
        if (next.most && next.least && next.most !== next.least) setTimeout(advanceFc, 350);
      };
      return shell(
        /* @__PURE__ */ React.createElement(Console, null, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: T.consoleMut, marginBottom: 14 } }, "Section 01 / Disposition \xB7 Q ", String(idx + 1).padStart(2, "0"), " of ", FC_BLOCKS.length), /* @__PURE__ */ React.createElement(ProgressTimer, { complete: idx, total: FC_BLOCKS.length, seconds: timeLeft, max: QUESTION_SECONDS }), /* @__PURE__ */ React.createElement("h2", { style: { fontSize: 18, fontWeight: 500, lineHeight: 1.55, margin: "0 0 20px", color: T.consoleText } }, "Mark one statement ", /* @__PURE__ */ React.createElement("span", { style: { color: T.most, fontWeight: 700 } }, "MOST"), " like you and one ", /* @__PURE__ */ React.createElement("span", { style: { color: T.least, fontWeight: 700 } }, "LEAST"), " like you."), /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gap: 10 } }, block.statements.map((s) => {
          const isMost = ans.most === s.id, isLeast = ans.least === s.id;
          return /* @__PURE__ */ React.createElement("div", { key: s.id, style: {
            background: T.consoleCard,
            borderRadius: 10,
            padding: "16px 16px 14px",
            border: `1.5px solid ${isMost ? T.most : isLeast ? T.least : T.darkLine}`,
            boxShadow: isMost ? `0 0 0 3px ${T.most}22` : isLeast ? `0 0 0 3px ${T.least}22` : "none",
            transition: "border-color .15s, box-shadow .15s"
          } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 15.5, lineHeight: 1.55, marginBottom: 12 } }, s.text), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8 } }, /* @__PURE__ */ React.createElement(
            "button",
            {
              onClick: () => pick("most", s.id),
              style: { flex: 1, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, fontWeight: 600, letterSpacing: "0.1em", padding: "9px 0", borderRadius: 6, cursor: "pointer", border: `1px solid ${isMost ? T.most : T.darkLine}`, background: isMost ? T.most : "transparent", color: isMost ? "#0C1310" : T.most }
            },
            "\u25B2 MOST"
          ), /* @__PURE__ */ React.createElement(
            "button",
            {
              onClick: () => pick("least", s.id),
              style: { flex: 1, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, fontWeight: 600, letterSpacing: "0.1em", padding: "9px 0", borderRadius: 6, cursor: "pointer", border: `1px solid ${isLeast ? T.least : T.darkLine}`, background: isLeast ? T.least : "transparent", color: isLeast ? "#140C05" : T.least }
            },
            "\u25BC LEAST"
          )));
        })), /* @__PURE__ */ React.createElement("div", { style: { marginTop: 18, textAlign: "center" } }, idx > 0 && /* @__PURE__ */ React.createElement("button", { onClick: () => setIdx(idx - 1), style: { background: "none", border: "none", color: T.consoleMut, fontSize: 12, cursor: "pointer", fontFamily: "'IBM Plex Mono', monospace" } }, "\u2039 back")))
      );
    }
    if (step === "scen") {
      const sc = SCENARIOS[idx];
      const choice = scAnswers[sc.code];
      return shell(
        /* @__PURE__ */ React.createElement(Console, null, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: T.consoleMut, marginBottom: 14 } }, "Section 02 / Situational judgment \xB7 Q ", String(idx + 1).padStart(2, "0"), " of ", SCENARIOS.length), /* @__PURE__ */ React.createElement(ProgressTimer, { complete: idx, total: SCENARIOS.length, seconds: timeLeft, max: QUESTION_SECONDS }), /* @__PURE__ */ React.createElement("h2", { style: { fontSize: 17.5, fontWeight: 500, lineHeight: 1.6, margin: "0 0 20px", color: T.consoleText } }, sc.prompt), /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gap: 10 } }, sc.options.map((o) => {
          const sel = choice === o.id;
          return /* @__PURE__ */ React.createElement(
            "button",
            {
              key: o.id,
              onClick: () => {
                setScAnswers({ ...scAnswers, [sc.code]: o.id });
                setTimeout(advanceScen, 300);
              },
              style: {
                textAlign: "left",
                display: "flex",
                gap: 12,
                alignItems: "flex-start",
                background: sel ? `${T.most}1A` : T.consoleCard,
                border: `1.5px solid ${sel ? T.most : T.darkLine}`,
                boxShadow: sel ? `0 0 0 3px ${T.most}22` : "none",
                borderRadius: 10,
                padding: "14px 16px",
                fontSize: 14.5,
                lineHeight: 1.6,
                cursor: "pointer",
                color: T.consoleText,
                transition: "border-color .15s"
              }
            },
            /* @__PURE__ */ React.createElement("span", { style: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, fontWeight: 600, color: sel ? T.most : T.consoleMut, textTransform: "uppercase", marginTop: 2 } }, o.id),
            o.text
          );
        })), /* @__PURE__ */ React.createElement("div", { style: { marginTop: 18, textAlign: "center" } }, idx > 0 && /* @__PURE__ */ React.createElement("button", { onClick: () => setIdx(idx - 1), style: { background: "none", border: "none", color: T.consoleMut, fontSize: 12, cursor: "pointer", fontFamily: "'IBM Plex Mono', monospace" } }, "\u2039 back")))
      );
    }
    if (step === "calib") {
      const item = CALIBRATION[idx];
      const val = calAnswers[item.code];
      return shell(
        /* @__PURE__ */ React.createElement(Console, null, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: T.consoleMut, marginBottom: 14 } }, "Section 03 / Calibration \xB7 Q ", String(idx + 1).padStart(2, "0"), " of ", CALIBRATION.length), /* @__PURE__ */ React.createElement(ProgressTimer, { complete: idx, total: CALIBRATION.length, seconds: timeLeft, max: QUESTION_SECONDS }), /* @__PURE__ */ React.createElement("h2", { style: { fontSize: 17.5, fontWeight: 500, lineHeight: 1.6, margin: "0 0 20px", color: T.consoleText } }, item.text), /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gap: 8, maxWidth: 480 } }, LIKERT.map((label, i) => {
          const v = i + 1;
          const sel = val === v;
          return /* @__PURE__ */ React.createElement(
            "button",
            {
              key: v,
              onClick: () => {
                setCalAnswers({ ...calAnswers, [item.code]: v });
                setTimeout(advanceCalib, 300);
              },
              style: { textAlign: "left", display: "flex", alignItems: "center", gap: 14, background: sel ? `${T.most}1A` : T.consoleCard, border: `1.5px solid ${sel ? T.most : T.darkLine}`, boxShadow: sel ? `0 0 0 3px ${T.most}22` : "none", borderRadius: 10, padding: "12px 16px", fontSize: 14.5, cursor: "pointer", color: T.consoleText }
            },
            /* @__PURE__ */ React.createElement("span", { style: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, fontWeight: 600, color: sel ? T.most : T.consoleMut, width: 12 } }, v),
            label
          );
        })), /* @__PURE__ */ React.createElement("div", { style: { marginTop: 18, textAlign: "center" } }, idx > 0 && /* @__PURE__ */ React.createElement("button", { onClick: () => setIdx(idx - 1), style: { background: "none", border: "none", color: T.consoleMut, fontSize: 12, cursor: "pointer", fontFamily: "'IBM Plex Mono', monospace" } }, "\u2039 back")))
      );
    }
    if (step === "adjacency") {
      return shell(
        /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement(Eyebrow, null, "Step 6 of 6 \u2014 Adjacency evaluation"), /* @__PURE__ */ React.createElement("h2", { style: { fontSize: 24, fontWeight: 700, margin: "10px 0 4px" } }, "Assessor section"), /* @__PURE__ */ React.createElement("div", { style: { background: T.amberSoft, border: `1px solid ${T.amber}33`, borderRadius: 8, padding: "12px 16px", fontSize: 13, color: T.amber, marginBottom: 24, lineHeight: 1.55 } }, "Adjacency is ", /* @__PURE__ */ React.createElement("strong", null, "evidence-rated by an assessor"), ", never self-reported by the candidate. In this prototype you are playing the assessor role. Ratings are relative to this specific asset."), /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gap: 16 } }, ADJACENCY_RUBRIC.map((r) => /* @__PURE__ */ React.createElement("div", { key: r.code, style: { background: T.surface, border: `1px solid ${T.line}`, borderRadius: 8, padding: 18 } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 } }, /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 600, fontSize: 15 } }, /* @__PURE__ */ React.createElement("span", { style: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: T.mut, marginRight: 8 } }, r.code), r.label), /* @__PURE__ */ React.createElement("span", { style: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, color: T.accent } }, adjScores[r.code], " / 5")), /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6, margin: "10px 0" } }, [1, 2, 3, 4, 5].map((v) => /* @__PURE__ */ React.createElement(
          "button",
          {
            key: v,
            onClick: () => setAdjScores({ ...adjScores, [r.code]: v }),
            style: { padding: "8px 0", borderRadius: 6, fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, fontWeight: 600, cursor: "pointer", border: `1.5px solid ${adjScores[r.code] === v ? T.accent : T.line}`, background: adjScores[r.code] === v ? T.accent : "#fff", color: adjScores[r.code] === v ? "#fff" : T.ink }
          },
          v
        ))), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12.5, color: T.mut, lineHeight: 1.6 } }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("strong", null, "1"), " \u2014 ", r.anchor_1), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("strong", null, "3"), " \u2014 ", r.anchor_3), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("strong", null, "5"), " \u2014 ", r.anchor_5), /* @__PURE__ */ React.createElement("div", { style: { marginTop: 6, fontFamily: "'IBM Plex Mono', monospace", fontSize: 11 } }, "Evidence: ", r.evidence.join(" \xB7 ")))))), ipGateActive && /* @__PURE__ */ React.createElement("label", { style: { display: "flex", gap: 10, alignItems: "flex-start", background: T.surface, border: `1px solid ${T.line}`, borderRadius: 8, padding: 16, marginTop: 16, fontSize: 13.5, lineHeight: 1.55, cursor: "pointer" } }, /* @__PURE__ */ React.createElement("input", { type: "checkbox", checked: ipReviewed, onChange: (e) => setIpReviewed(e.target.checked), style: { marginTop: 3 } }), /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement("strong", null, "GATE_IP_CONFLICT attestation."), " This asset's IP is encumbered (D9 \u2265 4). I attest that a documented conflict-of-interest review has been completed.")), buyerGateActive && /* @__PURE__ */ React.createElement("div", { style: { background: T.surface, border: `1px solid ${T.line}`, borderRadius: 8, padding: 16, marginTop: 16 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 13.5, fontWeight: 600, marginBottom: 6 } }, "GATE_BUYER_ACCESS waiver (optional)"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12.5, color: T.mut, marginBottom: 8 } }, "Institutional buyers (D7 \u2265 4) require J2 \u2265 45. If the candidate falls short, the gate is waivable only by naming a complementary co-founder."), /* @__PURE__ */ React.createElement(
          "textarea",
          {
            value: waiverNote,
            onChange: (e) => setWaiverNote(e.target.value),
            placeholder: "Name the complementary co-founder and their buyer-market access\u2026",
            rows: 2,
            style: { width: "100%", padding: "9px 11px", border: `1px solid ${T.line}`, borderRadius: 6, fontSize: 13, fontFamily: "'IBM Plex Sans', sans-serif", resize: "vertical", background: "#fff" }
          }
        )), /* @__PURE__ */ React.createElement("div", { style: { marginTop: 26 } }, /* @__PURE__ */ React.createElement(Btn, { kind: "accent", onClick: () => finish() }, "Run score \u2192")))
      );
    }
    if (step === "results" && output) {
      const R = output.result;
      const bandColor = R.band === "anchor" ? T.accent : R.band === "no_fit_anchor" ? T.red : R.band === "anchor_with_complement" ? T.accent : T.amber;
      const strengths = [...R.dimensions].filter((d) => d.surplus > 0 || d.shortfall < CONSTANTS.GAP_MIN_SHORTFALL).sort((a, b) => b.weight * (b.percentile - 50) - a.weight * (a.percentile - 50)).slice(0, 5).filter((d) => d.percentile >= 55);
      const groups = [["P", "Disposition \u2014 stable traits, designed around"], ["C", "Capability \u2014 learnable in 90\u2013180 days"], ["J", "Adjacency \u2014 position relative to this asset"]];
      const sevColor = { critical: T.red, material: T.amber, minor: T.mut };
      const sevBg = { critical: T.redSoft, material: T.amberSoft, minor: "#EEF0EA" };
      return shell(
        /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { background: T.dark, color: "#E8EBE6", borderRadius: 10, padding: "26px 26px 22px", marginBottom: 26 } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 20 } }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "#8B94A1" } }, "FounderFit report \xB7 ", candidateName || "Candidate", " \xD7 ", asset.name), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "baseline", gap: 18, marginTop: 12, flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("span", { style: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 56, fontWeight: 600, lineHeight: 1 } }, R.ffi), /* @__PURE__ */ React.createElement("span", { style: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 14, color: "#8B94A1", marginLeft: 6 } }, "/ 100 FFI")), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 20, fontWeight: 700, color: bandColor === T.red ? "#F2A69E" : bandColor === T.amber ? "#E8C27A" : "#7ED0B4" } }, BAND_LABELS[R.band]), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 13, color: "#B9C1CC", maxWidth: 460, lineHeight: 1.5 } }, BAND_DESC[R.band])))), /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: "#8B94A1", textAlign: "right", lineHeight: 1.9 } }, "anchor confidence ", R.anchor_confidence, "/5", /* @__PURE__ */ React.createElement("br", null), "validity: ", /* @__PURE__ */ React.createElement("span", { style: { color: R.validity.status === "clean" ? "#7ED0B4" : R.validity.status === "flagged" ? "#E8C27A" : "#F2A69E" } }, R.validity.status), /* @__PURE__ */ React.createElement("br", null), "pattern: ", R.fit_pattern.label, R.fit_pattern.hybrid_with ? ` / ${FIT_PATTERNS.find((p) => p.code === R.fit_pattern.hybrid_with)?.label}` : ""))), /* @__PURE__ */ React.createElement("section", { style: { marginBottom: 28 } }, /* @__PURE__ */ React.createElement(Eyebrow, null, "Gates \u2014 pass/fail conditions for the anchor role"), /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gap: 8, marginTop: 12 } }, R.gates.map((g) => /* @__PURE__ */ React.createElement("div", { key: g.code, style: { display: "flex", gap: 12, alignItems: "flex-start", background: T.surface, border: `1px solid ${T.line}`, borderLeft: `4px solid ${g.passed ? T.accent : g.waived ? T.amber : T.red}`, borderRadius: 6, padding: "11px 14px", fontSize: 13.5 } }, /* @__PURE__ */ React.createElement("span", { style: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, fontWeight: 600, color: g.passed ? T.accent : g.waived ? T.amber : T.red, minWidth: 62 } }, g.passed ? "PASS" : g.waived ? "WAIVED" : "FAIL"), /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement("strong", null, g.code.replace("GATE_", "")), g.dimension ? ` (${g.dimension} \u2265 ${g.threshold})` : "", " \u2014 ", g.reason, g.waiver_note && /* @__PURE__ */ React.createElement("em", { style: { display: "block", color: T.mut, marginTop: 2 } }, "Waiver: ", g.waiver_note)))))), /* @__PURE__ */ React.createElement("section", { style: { marginBottom: 28 } }, /* @__PURE__ */ React.createElement(Eyebrow, null, "Dimension profile \u2014 actual vs. demand (tick = what this asset requires)"), groups.map(([g, title]) => /* @__PURE__ */ React.createElement("div", { key: g, style: { marginTop: 18 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 13, fontWeight: 700, marginBottom: 10 } }, title), /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gap: 9 } }, R.dimensions.filter((d) => d.group === g).map((d) => /* @__PURE__ */ React.createElement("div", { key: d.code, style: { display: "grid", gridTemplateColumns: "minmax(180px, 260px) 1fr 140px", gap: 12, alignItems: "center" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12.5, lineHeight: 1.35 } }, /* @__PURE__ */ React.createElement("span", { style: { fontFamily: "'IBM Plex Mono', monospace", color: T.mut, marginRight: 6 } }, d.code), d.label), /* @__PURE__ */ React.createElement(ReadoutBar, { percentile: d.percentile, demand: d.demand_level, group: d.group }), /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5, color: T.mut, textAlign: "right" } }, d.percentile.toFixed(0), " vs ", d.demand_level, " \xB7 w", d.weight.toFixed(1)))))))), /* @__PURE__ */ React.createElement("section", { style: { marginBottom: 28 } }, /* @__PURE__ */ React.createElement(Eyebrow, null, "Talents against this asset"), /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gap: 8, marginTop: 12 } }, strengths.length === 0 && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 13.5, color: T.mut } }, "No dimension meaningfully exceeds this asset's demand profile."), strengths.map((d) => /* @__PURE__ */ React.createElement("div", { key: d.code, style: { background: T.accentSoft, border: `1px solid ${T.accent}33`, borderRadius: 6, padding: "11px 14px", fontSize: 13.5, lineHeight: 1.5 } }, /* @__PURE__ */ React.createElement("strong", null, d.label), " ", /* @__PURE__ */ React.createElement("span", { style: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5, color: T.mut } }, "(", d.code, " \xB7 ", d.percentile.toFixed(0), ", demand ", d.demand_level, ")"), /* @__PURE__ */ React.createElement("div", { style: { color: "#33413B", marginTop: 2 } }, FALLBACK.strength[d.code]))))), /* @__PURE__ */ React.createElement("section", { style: { marginBottom: 28 } }, /* @__PURE__ */ React.createElement(Eyebrow, null, "Gap ledger \u2014 what falls short of this venture's demand, and what to do about it"), /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gap: 8, marginTop: 12 } }, R.gaps.length === 0 && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 13.5, color: T.mut } }, "No gaps at or above the reporting threshold."), R.gaps.map((g) => /* @__PURE__ */ React.createElement("div", { key: g.dimension, style: { background: sevBg[g.severity], border: `1px solid ${sevColor[g.severity]}33`, borderRadius: 6, padding: "12px 14px", fontSize: 13.5, lineHeight: 1.55 } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 } }, /* @__PURE__ */ React.createElement("strong", null, g.label, " ", /* @__PURE__ */ React.createElement("span", { style: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5, fontWeight: 400, color: T.mut } }, "(", g.dimension, ")")), /* @__PURE__ */ React.createElement("span", { style: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, fontWeight: 600, color: sevColor[g.severity], textTransform: "uppercase", letterSpacing: "0.08em" } }, g.severity, " \xB7 shortfall ", g.shortfall.toFixed(0))), /* @__PURE__ */ React.createElement("div", { style: { color: "#4A4438", marginTop: 3 } }, FALLBACK.gap[g.dimension]), /* @__PURE__ */ React.createElement("div", { style: { marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" } }, g.routes.map((r) => /* @__PURE__ */ React.createElement("span", { key: r, style: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, border: `1px solid ${sevColor[g.severity]}55`, borderRadius: 4, padding: "2px 7px", color: sevColor[g.severity] } }, ROUTE_LABELS[r]))))))), /* @__PURE__ */ React.createElement("section", { style: { marginBottom: 28 } }, /* @__PURE__ */ React.createElement(Eyebrow, null, "Fit pattern"), /* @__PURE__ */ React.createElement("div", { style: { background: T.surface, border: `1px solid ${T.line}`, borderRadius: 8, padding: 18, marginTop: 12, fontSize: 14, lineHeight: 1.6 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 17, fontWeight: 700 } }, R.fit_pattern.label, /* @__PURE__ */ React.createElement("span", { style: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, fontWeight: 400, color: T.mut, marginLeft: 10 } }, "similarity ", R.fit_pattern.similarity), R.fit_pattern.hybrid_with && /* @__PURE__ */ React.createElement("span", { style: { fontSize: 13, fontWeight: 500, color: T.mut, marginLeft: 8 } }, "hybrid with ", FIT_PATTERNS.find((p) => p.code === R.fit_pattern.hybrid_with)?.label)), /* @__PURE__ */ React.createElement("div", { style: { marginTop: 8 } }, /* @__PURE__ */ React.createElement("strong", null, "Characteristic failure mode:"), " ", R.fit_pattern.failure_mode), /* @__PURE__ */ React.createElement("div", { style: { marginTop: 4 } }, /* @__PURE__ */ React.createElement("strong", null, "Remedy:"), " ", R.fit_pattern.remedy))), R.risk_flags.length > 0 && /* @__PURE__ */ React.createElement("section", { style: { marginBottom: 28 } }, /* @__PURE__ */ React.createElement(Eyebrow, null, "Risk flags"), /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gap: 8, marginTop: 12 } }, R.risk_flags.map((f) => /* @__PURE__ */ React.createElement("div", { key: f.code, style: { background: T.surface, border: `1px solid ${T.line}`, borderLeft: `4px solid ${f.severity === "high" ? T.red : f.severity === "medium" ? T.amber : T.mut}`, borderRadius: 6, padding: "11px 14px", fontSize: 13.5, lineHeight: 1.55 } }, /* @__PURE__ */ React.createElement("strong", { style: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 } }, f.code), " \u2014 ", f.message, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: T.mut, marginTop: 3 } }, f.evidence.join(" \xB7 ")))))), R.complementarity_spec.length > 0 && /* @__PURE__ */ React.createElement("section", { style: { marginBottom: 28 } }, /* @__PURE__ */ React.createElement(Eyebrow, null, "Complementarity spec \u2014 what the co-founder or hire must bring"), /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gap: 8, marginTop: 12 } }, R.complementarity_spec.map((c) => /* @__PURE__ */ React.createElement("div", { key: c.dimension, style: { background: T.surface, border: `1px solid ${T.line}`, borderRadius: 6, padding: "11px 14px", fontSize: 13.5, lineHeight: 1.55 } }, /* @__PURE__ */ React.createElement("strong", { style: { fontFamily: "'IBM Plex Mono', monospace" } }, c.dimension, " \u2265 ", c.min_percentile), " \u2014 ", c.rationale)))), /* @__PURE__ */ React.createElement("section", { style: { marginBottom: 28 } }, /* @__PURE__ */ React.createElement(Eyebrow, null, "Narrative report"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 10, alignItems: "center", margin: "12px 0", flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement("select", { value: audience, onChange: (e) => setAudience(e.target.value), style: { padding: "8px 10px", border: `1px solid ${T.lineDark}`, borderRadius: 6, fontSize: 13, background: "#fff" } }, /* @__PURE__ */ React.createElement("option", { value: "decision_maker" }, "Decision-maker report"), /* @__PURE__ */ React.createElement("option", { value: "candidate" }, "Candidate-facing report")), /* @__PURE__ */ React.createElement(Btn, { small: true, kind: "primary", onClick: generateNarrative, disabled: narrLoading }, narrLoading ? "Writing\u2026" : "Generate narrative (LLM, prompt v1.0.0)")), narrError && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12.5, color: T.amber, marginBottom: 10 } }, narrError), /* @__PURE__ */ React.createElement("div", { style: { background: T.surface, border: `1px solid ${T.line}`, borderRadius: 8, padding: 20, fontSize: 14.5, lineHeight: 1.7, whiteSpace: "pre-wrap" } }, narrative ?? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: T.mut, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.1em" } }, "Deterministic fallback narrative"), `${candidateName || "The candidate"} scores ${R.ffi} (FFI) against ${asset.name}, placing in the ${BAND_LABELS[R.band]} band with anchor confidence ${R.anchor_confidence} of 5. ` + (R.gates.some((g) => !g.passed && !g.waived) ? "One or more gates failed: this candidate is not the anchor founder for this asset regardless of alignment elsewhere. " : "All active gates passed" + (R.gates.some((g) => g.waived) ? " (one waived)" : "") + ". ") + (strengths.length ? `Principal strengths against this asset: ${strengths.map((d) => d.label).join("; ")}. ` : "") + (R.gaps.filter((g) => g.group === "C").length ? `Development priorities (capabilities, closable in 90\u2013180 days): ${R.gaps.filter((g) => g.group === "C").map((g) => g.label).join("; ")}. ` : "") + (R.gaps.filter((g) => g.group === "P").length ? `Structural considerations (dispositions, to design around rather than train): ${R.gaps.filter((g) => g.group === "P").map((g) => g.label).join("; ")}. ` : "") + (R.gaps.filter((g) => g.group === "J").length ? `Adjacency gaps: ${R.gaps.filter((g) => g.group === "J").map((g) => `${g.label} (${g.routes.map((r) => ROUTE_LABELS[r]).join(", ")})`).join("; ")}. ` : "") + `Fit pattern: ${R.fit_pattern.label}. Characteristic failure mode: ${R.fit_pattern.failure_mode} Remedy: ${R.fit_pattern.remedy}`))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 10, flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement(Btn, { kind: "ghost", onClick: () => {
          setStep("intro");
          setFcAnswers({});
          setScAnswers({});
          setCalAnswers({});
          setContext({});
          setLatencies([]);
          setOutput(null);
          setIdx(0);
          setWaiverNote("");
          setIpReviewed(false);
        } }, "New assessment"), /* @__PURE__ */ React.createElement(Btn, { kind: "ghost", onClick: () => {
          setStep("adjacency");
        } }, "Adjust adjacency & re-score")), /* @__PURE__ */ React.createElement("p", { style: { marginTop: 30, fontSize: 11.5, color: T.mut, lineHeight: 1.65, fontFamily: "'IBM Plex Mono', monospace" } }, "algo ", R.algo_version, " \xB7 content ", R.content_version, " \xB7 norms ", R.norms_version, ". FounderFit is a developmental and advisory instrument for matching founders to specific technology assets. It is not a psychological, clinical, or diagnostic assessment and should not be the sole basis for any employment, contractual, or funding decision. Scores are relative to the requirements of a specific asset and are not general measures of ability.")),
        { wide: true }
      );
    }
    return shell(/* @__PURE__ */ React.createElement("div", null));
  }

export default function Page() {
  return <FounderFitAssessment />;
}
