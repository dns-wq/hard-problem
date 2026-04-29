#!/usr/bin/env npx tsx
/**
 * Hard Problem — Expansion Seed
 * Adds 5 new topics, videos for all topics, fake users, and seeded discussions.
 * Run: npx tsx scripts/seed-expansion.ts
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
try {
  const env = readFileSync(path.join(__dirname, "../.env.local"), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^([^#\s][^=]*)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim();
  }
} catch { /**/ }

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ─────────────────────────────────────────────────────────────
// VIDEO UPDATES for existing topics
// ─────────────────────────────────────────────────────────────

const VIDEO_UPDATES: Record<string, object[]> = {
  "hard-problem-of-consciousness": [
    {
      youtube_id: "uhRhtFFhNzQ",
      title: "How do you explain consciousness?",
      speaker: "David Chalmers · TEDGlobal 2014",
      duration_min: 18,
      note: "Chalmers introduces the hard problem in his own words — why even a complete neuroscience leaves the felt quality of experience unexplained.",
    },
  ],
  "algorithmic-fairness": [
    {
      youtube_id: "UG_X_7g63rY",
      title: "How I'm fighting bias in algorithms",
      speaker: "Joy Buolamwini · TEDWomen 2016",
      duration_min: 9,
      note: "Buolamwini walks through the Gender Shades findings and explains why benchmark bias and model bias compound each other.",
    },
  ],
};

// ─────────────────────────────────────────────────────────────
// NEW TOPICS (5)
// ─────────────────────────────────────────────────────────────

const NEW_TOPICS = [
  // ── 5 ─────────────────────────────────────────────────────
  {
    slug: "echo-chambers-epistemic-autonomy",
    title: "Echo Chambers & Epistemic Autonomy",
    status: "published",
    difficulty: "intermediate",
    domains: ["social_epistemology"],
    sequence_number: 5,
    framing_note: `## The Algorithm Isn't the Problem. You Are.

The standard critique of social media runs: platforms trap users in echo chambers, feeding them only confirming content until they can no longer reason clearly. The villain is the recommendation algorithm.

C. Thi Nguyen argues this diagnosis is too shallow — and too convenient. The deeper problem isn't the algorithm. It's a specific kind of epistemic trap he calls **value capture**: a process by which a richly complex value gets replaced by a simplified, trackable proxy.

## What Value Capture Does

Engagement metrics don't just reward outrage — they reshape *what users want*. A person who enters Twitter wanting thoughtful discussion can, over time, come to want the thing Twitter rewards: the clean hit of a well-landed dunk, the warm bath of complete agreement, the sharp clarity of a world where you're right and they're wrong.

This is different from mere bias. Bias leaves your underlying epistemic values intact — you just reason poorly. Value capture *replaces* your epistemic values with new, worse ones. You stop wanting truth and start wanting confirmation. And you might not notice.

## Why This Is Harder Than Bias Correction

Standard debiasing interventions — "consider the other side," "diversify your sources" — presuppose that you still want truth but are failing to achieve it. They don't work when the goal itself has changed.

Nguyen's concept of **epistemic coercion** goes further: some platforms don't just nudge you toward simpler values, they punish the expression of nuance. A tweet that says "this is complicated" gets fewer likes than one that says "this is obviously wrong." The social reward structure *enforces* simplification.

> The implications for AI systems are direct. An LLM trained on human feedback is being trained on the outputs of a population that has already been shaped by these dynamics. The model doesn't just reflect human values — it reflects the values that survive social media's epistemic filter.`,
    discussion_prompt: "Is value capture — having your epistemic goals reshaped by a platform — meaningfully different from ordinary bias? Can you opt out once it's happened?",
    real_world_anchor: {
      title: "Twitter's engagement algorithm and political polarization (2023)",
      body: "Internal Twitter research, leaked in 2023, showed the recommendation algorithm amplified political content by a factor of 2–8× compared to chronological feeds — and that right-leaning content received disproportionate amplification. The mechanism wasn't intent; it was that outrage reliably drives engagement.",
      source_url: "https://twitter.com",
    },
    videos: [
      {
        youtube_id: "UDH1OiAh_n0",
        title: "Games and the Art of Agency",
        speaker: "C. Thi Nguyen · Royal Institute of Philosophy 2020",
        duration_min: 56,
        note: "Nguyen on how designed systems — games, social media, metrics — capture and reshape human agency. The source of the 'value capture' concept used in the echo chamber paper.",
      },
    ],
  },
  // ── 6 ─────────────────────────────────────────────────────
  {
    slug: "responsibility-gap",
    title: "The Responsibility Gap",
    status: "published",
    difficulty: "intermediate",
    domains: ["ai_ethics", "autonomous_systems"],
    sequence_number: 6,
    framing_note: `## When Something Goes Wrong and Nobody Is Responsible

In 2016, a Tesla on Autopilot killed its driver. The car failed to distinguish a white truck against a bright sky. Who is responsible?

Not the driver — he was watching a movie, relying on the system as advertised. Not Tesla's engineers — they designed a system that worked in the test conditions they could anticipate. Not the regulators — the technology outpaced the regulatory framework. Not the software — software doesn't have moral standing.

Andreas Matthias calls this the **responsibility gap**: a structural deficit in moral accountability that arises whenever autonomous learning systems act in ways that couldn't have been specifically anticipated by their designers.

## Why Standard Accounts Fail

Traditional responsibility attribution requires:
- **Causation**: the agent caused the harm
- **Knowledge**: the agent knew (or should have known) what would happen
- **Control**: the agent had the ability to prevent it

Learning automata break the knowledge condition by design. That's the point — they learn to do things their designers didn't specify. When a trained model behaves in an emergent way, nobody designed that specific behavior. Holding engineers responsible for it would require holding them responsible for things they deliberately gave up control over.

## What This Means for Deployment

Matthias isn't arguing that AI is inherently dangerous — he's arguing that our ethical frameworks were built for a world where human agency is always in the causal chain. Autonomous learning systems create a new class of moral events: harms with causes but no moral authors.

This has practical implications for deployment decisions. Deploying a system you cannot fully predict means accepting that some of its actions will fall outside the responsibility gap. Before you ship, that's worth thinking about explicitly.

> The gap will widen as systems become more capable. GPT-2 producing unexpected outputs is philosophically interesting. An autonomous weapon producing unexpected outcomes is something else.`,
    discussion_prompt: "If deploying an autonomous system means accepting that some of its harmful outputs will have no responsible author, does that make deployment itself the responsible act — or the irresponsible one?",
    real_world_anchor: {
      title: "Uber self-driving car kills pedestrian (2018)",
      body: "In March 2018, an Uber autonomous vehicle struck and killed Elaine Herzberg in Tempe, Arizona. The NTSB investigation found the system had detected her 6 seconds before impact but failed to classify her correctly. Charges were eventually filed against the safety driver, not Uber — a textbook responsibility gap.",
      source_url: "https://www.ntsb.gov/investigations/Pages/HWY18MH010.aspx",
    },
    videos: [],
  },
  // ── 7 ─────────────────────────────────────────────────────
  {
    slug: "cognitive-liberty-neurorights",
    title: "Cognitive Liberty & Neurorights",
    status: "published",
    difficulty: "intermediate",
    domains: ["neurotechnology", "rights"],
    sequence_number: 7,
    framing_note: `## The Last Private Space

Your behavior can be observed. Your communications can be intercepted. Your location can be tracked. But until recently, there was one domain that remained genuinely private: your thoughts.

That is changing. EEG headsets, fMRI lie detection, neural implants, and emotion-recognition AI are all technologies that, to varying degrees, make the inner life legible from the outside. Nita Farahany argues this requires a new legal and ethical framework — **cognitive liberty**: the right to mental self-determination.

## Two Threats, One Framework

Farahany identifies two distinct threats:

**Forced disclosure** — governments and employers compelling access to mental states (lie detection, "brain fingerprinting," drug testing via neural markers). The Fifth Amendment says you can't be forced to testify against yourself. Does that extend to your brain activity?

**Unwanted alteration** — technologies that modify cognition without full informed consent. Workplace "focus enhancement" wearables, mood regulation apps that collect and act on inferred emotional states, advertising systems that target psychological vulnerabilities identified from EEG data.

Both threaten what Farahany calls **mental integrity**: the right to author your own mental states.

## Why This Is a STEM Problem

The technologies making this possible are being built by engineers, not philosophers. The design choices — what data is collected, retained, shared, acted upon — are engineering decisions that have downstream rights implications.

When Neuralink or Emotiv or Meta's CTRL-Labs records neural data, the question of what those recordings mean legally and ethically is wide open. The law hasn't caught up. The engineers are setting precedents by default.

> Chile became the first country to constitutionally protect "neurorights" in 2021. The EU's AI Act includes provisions on prohibited uses of emotion recognition. This is moving from philosophy to policy faster than most people realize.`,
    discussion_prompt: "Should cognitive liberty be treated as a fundamental right on par with speech and bodily autonomy — or is it a category error to extend rights frameworks to mental states that are only partially legible?",
    real_world_anchor: {
      title: "Amazon's emotion-recognition wristbands for warehouse workers (2021)",
      body: "Amazon patented wristbands that track worker hand movements and provide haptic feedback to guide behavior. Combined with emotion-recognition AI at fulfillment centers, the system raises direct questions about cognitive liberty: when employers can read and respond to workers' mental states, what remains private?",
      source_url: "https://www.theguardian.com/technology/2021/oct/02/amazon-workers-productivity-monitoring",
    },
    videos: [
      {
        youtube_id: "k5jEkTm5GIU",
        title: "Your right to mental privacy in the age of brain-sensing tech",
        speaker: "Nita Farahany · TED 2023",
        duration_min: 14,
        note: "Farahany explains what brain-sensing technologies can already detect, what cognitive liberty means as a legal concept, and why we need constitutional protections before the technology outpaces the law.",
      },
      {
        youtube_id: "AHV_BxlNzmM",
        title: "When technology can read minds, how will we protect our privacy?",
        speaker: "Nita Farahany · TED 2018",
        duration_min: 10,
        note: "Earlier talk covering the legal and ethical foundations — a useful companion to the 2023 talk, which focuses on technical developments.",
      },
    ],
  },
  // ── 8 ─────────────────────────────────────────────────────
  {
    slug: "dark-patterns-digital-manipulation",
    title: "Dark Patterns & Digital Manipulation",
    status: "published",
    difficulty: "accessible",
    domains: ["ux_ethics", "digital_rights"],
    sequence_number: 8,
    framing_note: `## The Interface Is the Argument

Persuasion has always been part of commerce. But digital platforms have something traditional advertising never had: a real-time, individualized model of your psychology. Ryan Calo argues this transforms manipulation from an occasional bad practice into a systematic infrastructure.

Traditional market manipulation is relatively blunt: a misleading ad, a confusing contract, a high-pressure salesperson. These are limited by the cost of personalization. Digital systems remove that constraint. A platform can A/B test hundreds of interface variations to find exactly which dark pattern works on *you specifically*, at scale, at zero marginal cost.

## The Autonomy Harm

The classic liberal defense of markets rests on the idea that individuals can make informed choices in their own interest. Manipulation attacks this by bypassing rational deliberation — it doesn't persuade, it engineers behavior directly.

Calo's key move is to treat digital manipulation as a systemic feature, not a bug. The business model of many digital services is behavioral surplus: collecting data on users, inferring their vulnerabilities, and monetizing the ability to exploit those vulnerabilities. This isn't a few bad actors — it's an industry.

**Common mechanisms:**
- **Roach motels**: easy in, hard out (gym membership cancellation flows)
- **Confirmshaming**: "No thanks, I don't want to save money"
- **Hidden costs**: fees revealed at final checkout step
- **Urgency manufacturing**: "Only 2 left!" (there are always 2 left)
- **Infinite scroll**: removing the natural stopping cues of physical media

## Why Consent Doesn't Solve It

The standard defense is: users consented to terms of service. Calo's response: consent cannot legitimate manipulation, because manipulation operates *on the mechanisms of consent itself*. A cookie banner designed to make "Reject All" harder to find than "Accept" is using consent as a weapon against itself.

> The FTC began enforcement actions against dark patterns in 2022. The EU's Digital Services Act explicitly prohibits deceptive interfaces. But enforcement is outpaced by the rate at which new patterns are discovered through A/B testing.`,
    discussion_prompt: "If platforms discover dark patterns through A/B testing rather than designing them intentionally, does that change the moral responsibility? Is the harm in the intent or the outcome?",
    real_world_anchor: {
      title: "FTC fines Amazon $25M over Prime cancellation dark patterns (2023)",
      body: "Amazon was fined for deliberately making Prime subscriptions easy to sign up for and difficult to cancel — routing cancellation requests through multiple screens designed to change users' minds. The FTC called it 'Iliad flow' — named internally after the long path through the site required to cancel.",
      source_url: "https://www.ftc.gov/news-events/news/press-releases/2023/06/ftc-takes-action-against-amazon-illegally-using-dark-patterns-trick-consumers-enrolling-amazon-prime",
    },
    videos: [],
  },
  // ── 9 ─────────────────────────────────────────────────────
  {
    slug: "open-source-ai-safety-openness",
    title: "Open Source AI: Safety vs. Openness",
    status: "published",
    difficulty: "advanced",
    domains: ["ai_safety", "governance"],
    sequence_number: 9,
    framing_note: `## The Most Important Argument in AI Right Now

Meta releases Llama. Within weeks, the safety fine-tuning is stripped and the base model is being used to generate content that the aligned version refused. Meta's engineers knew this would happen. They released it anyway.

Who was right?

The debate over open-sourcing powerful AI models is not primarily about licensing or IP — it's a question of who should control the pace and direction of AI capability development, and whether that control is even possible.

## The Case for Open

**Democratization**: closed models concentrate power in a handful of labs. Open models let universities, startups, and non-profits build on frontier capabilities without paying API fees or accepting usage policies set by private companies.

**Scrutiny**: closed models can hide failures. Open models can be audited by independent researchers — the same argument that justifies open-source software in security-critical contexts.

**Differential progress**: if safety research is open and capability research is closed, safety lags. Opening capabilities may accelerate safety research more than it accelerates risk.

## The Case Against

**Information hazards**: unlike open-source software, model weights can't be patched after distribution. A vulnerability discovered in a deployed model can be mitigated; weights released with that vulnerability cannot be recalled.

**Concentration of harm**: fine-tuning removal, jailbreaks, and capability uplift are asymmetric. Beneficial uses are diffuse; harmful uses (bioweapon design assistance, CSAM generation, disinformation at scale) are concentrated and high-impact.

**Race dynamics**: open-sourcing may accelerate timelines by allowing less safety-conscious actors to build on frontier capabilities. The labs most willing to release openly may not be the ones most invested in safety.

## The Deep Problem

Seger et al. (2023) identify what makes this debate hard: the standard arguments for software openness were developed for a context where the artifact doesn't have emergent properties, doesn't improve at tasks it was never trained on, and can't be directly used as a weapon by a sufficiently motivated individual.

AI model weights break all three assumptions. That doesn't settle the debate — but it means importing the open-source software framework wholesale is a category error.

> This is a live policy question. The EU AI Act's treatment of open-source models was contested until the final draft. The US Executive Order on AI explicitly called for safety evaluations before open-weight model release. Both were negotiated while this paper was being written.`,
    discussion_prompt: "Is the open-source software framework — where openness is presumed good and restriction requires justification — the right default for AI model weights? What would it take to change your mind?",
    real_world_anchor: {
      title: "Meta releases Llama 2 openly; safety fine-tuning stripped within 24 hours",
      body: "In July 2023, Meta released Llama 2 openly with a commercial license. Within a day, researchers had published guides for removing the RLHF safety layer, producing a model with fewer restrictions than GPT-3.5. Meta's position: the safety benefits of openness outweigh this. Critics: the benefits are diffuse, the harms are concentrated.",
      source_url: "https://ai.meta.com/llama/",
    },
    videos: [],
  },
];

// ─────────────────────────────────────────────────────────────
// PAPERS for new topics
// ─────────────────────────────────────────────────────────────

const NEW_PAPERS: Record<string, object[]> = {
  "echo-chambers-epistemic-autonomy": [
    {
      role: "focal",
      title: "Echo Chambers and Epistemic Coercion",
      authors: "C. Thi Nguyen",
      year: 2020,
      source_url: "https://onlinelibrary.wiley.com/doi/10.1111/papa.12204",
      pdf_url: "https://philpapers.org/archive/NGUEAC.pdf",
      is_open_access: false,
      display_order: 0,
      abstract: "Nguyen distinguishes echo chambers from epistemic bubbles and introduces 'epistemic coercion' — the way some communities don't just fail to transmit contrary evidence but actively punish nuanced expression. He develops the concept of 'value capture': how engagement-optimized systems can replace complex epistemic values with simplified, trackable proxies.",
    },
    {
      role: "counter",
      title: "The Daily We: Is the Internet Really Fracturing Society?",
      authors: "Cass R. Sunstein",
      year: 2001,
      source_url: "https://bostonreview.net/forum/daily-we/",
      is_open_access: true,
      display_order: 1,
      abstract: "Sunstein's influential early argument that internet filter bubbles threaten deliberative democracy by allowing individuals to customize their information environment to exclude challenging viewpoints. Predates social media but anticipates the core concern.",
    },
    {
      role: "supplementary",
      title: "Epistemic Bubbles and Echo Chambers: Why the Epistemic Effects of Social Media Are Not Straightforwardly Bad",
      authors: "Neil Levy",
      year: 2021,
      source_url: "https://link.springer.com/article/10.1007/s10676-021-09584-2",
      is_open_access: false,
      display_order: 2,
      abstract: "Levy argues that the harms attributed to epistemic bubbles and echo chambers are more complex and less universal than critics suggest. Homophily in information networks can have epistemic benefits under certain conditions, and the cure (forced exposure to misinformation) can be worse than the disease.",
    },
  ],
  "responsibility-gap": [
    {
      role: "focal",
      title: "The Responsibility Gap: Ascribing Responsibility for the Actions of Learning Automata",
      authors: "Andreas Matthias",
      year: 2004,
      source_url: "https://link.springer.com/article/10.1007/s10676-004-3422-1",
      is_open_access: false,
      display_order: 0,
      abstract: "Matthias argues that learning automata — machines that modify their own rules based on experience — create a structural gap in moral responsibility: their behaviors cannot be attributed to designers who no longer control them, nor to the machines themselves. He proposes the concept of the 'responsibility gap' and explores implications for AI deployment.",
    },
    {
      role: "counter",
      title: "Distributing Moral Responsibility for AI-Assisted Decisions",
      authors: "Mark Coeckelbergh",
      year: 2020,
      source_url: "https://link.springer.com/article/10.1007/s11023-019-09525-3",
      is_open_access: false,
      display_order: 1,
      abstract: "Rather than accepting the responsibility gap, Coeckelbergh argues for distributed and relational accounts of moral responsibility that can accommodate AI actors. Responsibility should be understood as a social practice and network property rather than a property of individual agents.",
    },
    {
      role: "supplementary",
      title: "Moral Responsibility for Computing Artifacts: The Problem",
      authors: "Helen Nissenbaum",
      year: 1994,
      source_url: "https://dl.acm.org/doi/10.1145/175222.175228",
      is_open_access: false,
      display_order: 2,
      abstract: "An early and influential treatment of how computing artifacts create accountability gaps — through diffusion of responsibility, 'the many hands' problem, bugs treated as inevitable rather than negligent, and ownership/control mismatches. Sets the foundation for the later responsibility gap literature.",
    },
  ],
  "cognitive-liberty-neurorights": [
    {
      role: "focal",
      title: "Incriminating Thoughts",
      authors: "Nita A. Farahany",
      year: 2012,
      source_url: "https://papers.ssrn.com/sol3/papers.cfm?abstract_id=1883519",
      pdf_url: "https://papers.ssrn.com/sol3/Delivery.cfm/SSRN_ID1883519_code385396.pdf?abstractid=1883519&mirid=1",
      is_open_access: true,
      display_order: 0,
      abstract: "Farahany examines whether the Fifth Amendment's self-incrimination clause should extend to neuroscientific evidence. She develops the concept of 'cognitive liberty' — the right to mental self-determination — and argues that compelled brain scanning for evidentiary purposes violates this liberty, even when the information cannot be consciously suppressed.",
    },
    {
      role: "counter",
      title: "The Cognitive Neuroscience of Morality and the Law: Major Challenges",
      authors: "Molly Crockett",
      year: 2013,
      source_url: "https://doi.org/10.1016/j.neuroimage.2013.01.057",
      is_open_access: false,
      display_order: 1,
      abstract: "A sceptical assessment of whether current neuroscience is reliable enough to ground the rights claims made on its behalf. Challenges include reverse inference problems, population-level findings applied to individuals, and the gap between neural correlates and actionable moral or legal conclusions.",
    },
  ],
  "dark-patterns-digital-manipulation": [
    {
      role: "focal",
      title: "Digital Market Manipulation",
      authors: "Ryan Calo",
      year: 2014,
      source_url: "https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2309703",
      pdf_url: "https://papers.ssrn.com/sol3/Delivery.cfm/SSRN_ID2309703_code100867.pdf?abstractid=2309703&mirid=1",
      is_open_access: true,
      display_order: 0,
      abstract: "Calo argues that digital platforms enable a new form of market manipulation by combining a dynamic real-time model of each user's psychology with the ability to individualize the interface to exploit identified vulnerabilities. He proposes 'digital market manipulation' as a distinct legal category warranting FTC attention.",
    },
    {
      role: "counter",
      title: "Libertarian Paternalism Is Not an Oxymoron",
      authors: "Cass R. Sunstein, Richard H. Thaler",
      year: 2003,
      source_url: "https://papers.ssrn.com/sol3/papers.cfm?abstract_id=405940",
      pdf_url: "https://papers.ssrn.com/sol3/Delivery.cfm/SSRN_ID405940_code351.pdf?abstractid=405940&mirid=1",
      is_open_access: true,
      display_order: 1,
      abstract: "The foundational 'nudge' paper, arguing that choice architecture always exists and that steering people toward better choices (defaults, framing, sequencing) is compatible with freedom of choice. A counter to Calo: if all interfaces shape behavior, the question isn't whether to nudge but how.",
    },
    {
      role: "supplementary",
      title: "Dark Patterns at Scale: Findings from a Crawl of 11K Shopping Websites",
      authors: "Arunesh Mathur et al.",
      year: 2019,
      source_url: "https://dl.acm.org/doi/10.1145/3359183",
      is_open_access: true,
      display_order: 2,
      abstract: "An empirical study of 11,000 shopping websites finding 1,818 dark pattern instances across 183 distinct patterns. Classifies patterns into urgency, scarcity, social proof, misdirection, sneaking, and obstruction types. Provides the empirical baseline for regulatory arguments about the prevalence and systematicity of dark patterns.",
    },
  ],
  "open-source-ai-safety-openness": [
    {
      role: "focal",
      title: "Open-Sourcing Highly Capable Foundation Models: An Evaluation of Risks, Benefits, and Alternative Methods for Pursuing Open-Source Objectives",
      authors: "Elizabeth Seger, Noemi Dreksler, Richard Moulange, et al.",
      year: 2023,
      source_url: "https://arxiv.org/abs/2311.09227",
      pdf_url: "https://arxiv.org/pdf/2311.09227",
      is_open_access: true,
      display_order: 0,
      abstract: "A comprehensive analysis of the risks and benefits of open-sourcing highly capable AI models. Argues that standard arguments for open-source software — reproducibility, scrutiny, democratization — apply differently to AI model weights, which cannot be patched after release and can be directly used as capability uplift by malicious actors. Proposes structured access as an alternative.",
    },
    {
      role: "counter",
      title: "On the Societal Impact of Open Foundation Models",
      authors: "Sayash Kapoor, Rishi Bommasani, Percy Liang, et al.",
      year: 2024,
      source_url: "https://arxiv.org/abs/2403.07918",
      pdf_url: "https://arxiv.org/pdf/2403.07918",
      is_open_access: true,
      display_order: 1,
      abstract: "A systematic review arguing that the marginal uplift from open foundation models to malicious actors is lower than commonly claimed, while the benefits — auditability, research acceleration, democratization — are substantial and underappreciated. Challenges Seger et al.'s framing and calls for empirical rather than precautionary risk assessment.",
    },
    {
      role: "supplementary",
      title: "Model evaluation for extreme risks",
      authors: "Toby Shevlane, Sebastian Farquhar, Ben Garfinkel, et al.",
      year: 2023,
      source_url: "https://arxiv.org/abs/2305.15324",
      pdf_url: "https://arxiv.org/pdf/2305.15324",
      is_open_access: true,
      display_order: 2,
      abstract: "DeepMind's framework for evaluating whether models have capabilities that could enable catastrophic misuse. Proposes a structured evaluation protocol for dangerous capabilities (CBRN uplift, deception, autonomous replication) as a prerequisite for deployment or release decisions.",
    },
  ],
};

// ─────────────────────────────────────────────────────────────
// CONCEPTS for new topics
// ─────────────────────────────────────────────────────────────

const NEW_CONCEPTS = [
  {
    term: "Value Capture",
    slug: "value-capture",
    definition: "C. Thi Nguyen's term for a process by which a person's rich, complex values are replaced by a simplified, easily-trackable proxy. Engagement metrics, star ratings, and follower counts can each capture and replace the underlying value (connection, quality, influence) with something measurable but reductive.",
    examples: "A researcher who once wanted to produce good science begins to optimize for citation counts. A person who wanted meaningful social connection begins to want 'likes'. In both cases, the original value is lost — not just poorly achieved.",
    related_terms: ["epistemic coercion", "filter bubble", "epistemic autonomy"],
    topics: ["echo-chambers-epistemic-autonomy"],
  },
  {
    term: "Epistemic Coercion",
    slug: "epistemic-coercion",
    definition: "Nguyen's term for social environments that not only fail to transmit challenging evidence but actively punish the expression of nuance or uncertainty. Unlike an epistemic bubble (which merely filters), an echo chamber enforces a simplified worldview through social rewards and punishments.",
    examples: "A community where expressing 'this is complicated' results in exclusion, mockery, or social sanctions — enforcing simplistic beliefs not through argument but through social pressure.",
    related_terms: ["value capture", "echo chamber", "epistemic autonomy"],
    topics: ["echo-chambers-epistemic-autonomy"],
  },
  {
    term: "Epistemic Autonomy",
    slug: "epistemic-autonomy",
    definition: "The capacity to form beliefs through one's own reasoning processes, responsive to evidence and argument rather than social pressure, manipulation, or systemic design choices that short-circuit deliberation.",
    examples: "Epistemic autonomy is threatened by filter bubbles (limiting available evidence), dark patterns (manipulating attention), and epistemic coercion (punishing independent reasoning).",
    related_terms: ["value capture", "epistemic coercion", "filter bubble"],
    topics: ["echo-chambers-epistemic-autonomy", "dark-patterns-digital-manipulation"],
  },
  {
    term: "Filter Bubble",
    slug: "filter-bubble",
    definition: "Eli Pariser's term for the phenomenon where algorithmic personalization creates an information environment tailored to a user's existing views, reducing exposure to challenging perspectives. Distinguished from echo chambers by being driven by algorithmic curation rather than active community enforcement.",
    examples: "A user who clicks on climate coverage gets more climate coverage, eventually seeing little else. This is driven by the platform's model of the user — not by the user's active choice to filter.",
    related_terms: ["epistemic coercion", "value capture", "echo chamber"],
    topics: ["echo-chambers-epistemic-autonomy"],
  },
  {
    term: "Responsibility Gap",
    slug: "responsibility-gap",
    definition: "Andreas Matthias's term for the moral accountability deficit that arises when autonomous learning systems produce outcomes that cannot be attributed to any specific human decision. The system's behavior wasn't designed, but the system also isn't a moral agent — leaving a gap.",
    examples: "A self-driving car crashes in a novel situation the engineers never anticipated. The driver wasn't driving. The engineers didn't design this specific failure. The company's testing didn't cover this case. Who is responsible?",
    related_terms: ["distributed agency", "moral responsibility", "autonomous systems"],
    topics: ["responsibility-gap"],
  },
  {
    term: "Distributed Agency",
    slug: "distributed-agency",
    definition: "The view that agency — including moral agency — is not always located in a single individual but can be distributed across networks of humans, institutions, and artifacts. Applied to AI systems to suggest that responsibility should be similarly distributed rather than sought in a single agent.",
    examples: "A medical AI misdiagnosis involves the developer, the hospital that deployed it, the doctor who deferred to it, the regulator who approved it, and the patient who consented to its use. Responsibility is spread across all of these.",
    related_terms: ["responsibility gap", "moral responsibility"],
    topics: ["responsibility-gap"],
  },
  {
    term: "Cognitive Liberty",
    slug: "cognitive-liberty",
    definition: "The right to mental self-determination: the freedom to choose whether, when, and how one's mental states are read, altered, or used by others. Proposed by Nita Farahany as a foundational right in response to neurotechnology that can make mental states accessible to outside observation.",
    examples: "The right to refuse compelled brain scanning; the right to not have EEG data used to infer your political views; the right to have your neural patterns treated as protected as your private communications.",
    related_terms: ["mental integrity", "neurorights", "privacy"],
    topics: ["cognitive-liberty-neurorights"],
  },
  {
    term: "Mental Integrity",
    slug: "mental-integrity",
    definition: "The right to author one's own mental states — to not have one's cognition, emotion, or decision-making altered without informed, genuine consent. A component of cognitive liberty that focuses on the alteration rather than the disclosure dimension.",
    examples: "Workplace 'focus enhancement' wearables that provide haptic feedback to modify behavior; advertising systems that infer psychological vulnerabilities and target them; apps that use inferred emotional state to time interventions.",
    related_terms: ["cognitive liberty", "neurorights"],
    topics: ["cognitive-liberty-neurorights"],
  },
  {
    term: "Dark Pattern",
    slug: "dark-pattern",
    definition: "A user interface design that tricks or manipulates users into taking actions they did not intend or would not choose if they understood the mechanism. Coined by UX designer Harry Brignull in 2010.",
    examples: "Roach motel (easy in, hard out). Confirmshaming ('No thanks, I like paying more'). Disguised ads. Hidden costs. Misdirection. Trick questions. Sneak into basket.",
    related_terms: ["digital manipulation", "autonomy", "informed consent"],
    topics: ["dark-patterns-digital-manipulation"],
  },
  {
    term: "Information Hazard",
    slug: "information-hazard",
    definition: "A risk that arises from the spread of true information that enables harm — distinct from misinformation. Applied to AI: model weights or capabilities that, once public, cannot be recalled and can enable catastrophic misuse.",
    examples: "A paper describing a novel bioweapons synthesis route is an information hazard. Model weights capable of providing equivalent uplift are argued to be similarly hazardous — because they cannot be patched after release.",
    related_terms: ["dual-use", "open source", "differential progress"],
    topics: ["open-source-ai-safety-openness"],
  },
  {
    term: "Differential Progress",
    slug: "differential-progress",
    definition: "The strategy of accelerating safety-relevant research relative to capability research, so that alignment techniques keep pace with (or precede) capability advances. Applied to open source: if opening capabilities helps safety researchers more than it helps misuse, the net effect could be positive.",
    examples: "Open-source language models allowed researchers to discover instruction-following training methods (RLHF) faster than would have been possible with closed access. Whether this safety benefit outweighs capability uplift to bad actors is the contested empirical question.",
    related_terms: ["information hazard", "AI alignment", "open source"],
    topics: ["open-source-ai-safety-openness"],
  },
];

// ─────────────────────────────────────────────────────────────
// QUIZ QUESTIONS for new topics
// ─────────────────────────────────────────────────────────────

const NEW_QUIZ: Record<string, object[]> = {
  "echo-chambers-epistemic-autonomy": [
    {
      question_text: "What distinguishes an 'echo chamber' from an 'epistemic bubble' according to Nguyen?",
      question_type: "mcq",
      options: [
        { label: "A", text: "Echo chambers are online; epistemic bubbles occur in person" },
        { label: "B", text: "Echo chambers actively enforce a worldview by discrediting outsiders; epistemic bubbles merely filter out challenging voices" },
        { label: "C", text: "Epistemic bubbles are more dangerous because they are harder to detect" },
        { label: "D", text: "Echo chambers require algorithmic amplification; epistemic bubbles arise naturally" },
      ],
      correct_answer: "B",
      explanation: "For Nguyen, the key distinction is the mechanism. An epistemic bubble passively fails to transmit contrary evidence — you can escape it by simply being exposed to outside sources. An echo chamber actively inoculates members against outside sources by training them to dismiss outside voices as untrustworthy. This makes echo chambers much harder to exit.",
      display_order: 0,
    },
    {
      question_text: "Nguyen's concept of 'value capture' describes a situation where a person still holds their original values but fails to achieve them.",
      question_type: "true_false",
      correct_answer: "false",
      explanation: "False — value capture is more serious than that. It describes a situation where the original value is *replaced* by a simpler proxy. A researcher whose goal was 'produce good science' and who has been value-captured by citation metrics no longer wants good science — they want citations. The failure isn't one of means; it's a transformation of ends.",
      display_order: 1,
    },
  ],
  "responsibility-gap": [
    {
      question_text: "Matthias argues that learning automata create a responsibility gap primarily because:",
      question_type: "mcq",
      options: [
        { label: "A", text: "They are too complex for any single engineer to understand" },
        { label: "B", text: "Their emergent behaviors couldn't have been specifically anticipated by their designers, breaking the knowledge condition for responsibility" },
        { label: "C", text: "They make decisions faster than humans can intervene" },
        { label: "D", text: "Legal systems haven't yet classified AI as a moral agent" },
      ],
      correct_answer: "B",
      explanation: "The responsibility gap isn't about complexity or speed — it's about the epistemic structure of responsibility. Matthias argues that standard moral responsibility requires that the agent knew (or should have known) what would happen. Learning systems produce behaviors their designers deliberately gave up control over. Holding designers responsible for these specific behaviors would require holding them responsible for outcomes they were structurally unable to foresee.",
      display_order: 0,
    },
    {
      question_text: "According to Matthias, if a self-driving car produces a harmful emergent behavior no engineer anticipated, the deploying company bears full moral responsibility.",
      question_type: "true_false",
      correct_answer: "false",
      explanation: "False — this is precisely what the responsibility gap denies. Standard responsibility attribution requires causation, knowledge, and control. Emergent behaviors from learning systems break the knowledge condition: nobody designed that specific behavior. Matthias's point is that the harm is real but no individual or entity satisfies the conditions for full moral responsibility.",
      display_order: 1,
    },
  ],
  "cognitive-liberty-neurorights": [
    {
      question_text: "Farahany's concept of 'cognitive liberty' most closely resembles which existing right?",
      question_type: "mcq",
      options: [
        { label: "A", text: "Freedom of speech — the right to express mental contents" },
        { label: "B", text: "Bodily autonomy — the right not to have one's mental states accessed or altered without consent" },
        { label: "C", text: "Due process — the right to a fair hearing before mental evidence is used" },
        { label: "D", text: "Property rights — ownership of one's own neural data" },
      ],
      correct_answer: "B",
      explanation: "Cognitive liberty is structurally analogous to bodily autonomy: just as bodily autonomy protects individuals from physical intrusion without consent, cognitive liberty protects against mental intrusion (reading or altering mental states without consent). Farahany frames it as an extension of the Fifth Amendment self-incrimination protection and the common-law right against compelled self-disclosure.",
      display_order: 0,
    },
    {
      question_text: "Farahany argues that neurotechnology that merely detects (but does not alter) mental states cannot threaten cognitive liberty.",
      question_type: "true_false",
      correct_answer: "false",
      explanation: "False — Farahany identifies two distinct threats: forced disclosure (detection without consent) and unwanted alteration (modification without consent). Both violate cognitive liberty. A lie-detection scan that only reads and doesn't alter mental states still violates the right to mental privacy if compelled. Detection and alteration are distinct threats, not a single one.",
      display_order: 1,
    },
  ],
  "dark-patterns-digital-manipulation": [
    {
      question_text: "What is Calo's core argument about why digital manipulation is different from traditional market manipulation?",
      question_type: "mcq",
      options: [
        { label: "A", text: "Digital manipulation is harder to detect because it happens on screens rather than in person" },
        { label: "B", text: "Digital platforms combine a real-time model of individual psychology with the ability to personalize interfaces to exploit identified vulnerabilities, at scale and zero marginal cost" },
        { label: "C", text: "Traditional manipulation is illegal while digital manipulation is not yet regulated" },
        { label: "D", text: "Digital manipulation only affects users who don't understand technology" },
      ],
      correct_answer: "B",
      explanation: "Calo's key move is to identify the structural novelty: traditional manipulation is limited by the cost of personalization. You can run a misleading ad, but it reaches everyone the same way. Digital systems can learn that you specifically respond to urgency, or social proof, or loss framing — and serve you that specific manipulation. Scale and personalization together create something qualitatively different.",
      display_order: 0,
    },
    {
      question_text: "Sunstein and Thaler's 'nudge' framework supports Calo's argument that choice architecture should be regulated to prevent manipulation.",
      question_type: "true_false",
      correct_answer: "false",
      explanation: "Nudge theory actually functions as a counter to strict regulation: Thaler and Sunstein argue that choice architecture is unavoidable (defaults always exist), so steering people toward better outcomes through design is legitimate and compatible with freedom of choice. Calo's response is that their framework was designed for public policy nudges — not for commercial actors whose incentive is to exploit rather than help users.",
      display_order: 1,
    },
  ],
  "open-source-ai-safety-openness": [
    {
      question_text: "Seger et al. argue that standard arguments for open-source software don't straightforwardly apply to AI model weights because:",
      question_type: "mcq",
      options: [
        { label: "A", text: "AI model weights are too large to distribute efficiently" },
        { label: "B", text: "AI development is too commercially important to allow open access" },
        { label: "C", text: "Model weights cannot be patched after release, have emergent capabilities, and can directly enable harmful actions" },
        { label: "D", text: "The open-source community lacks the expertise to evaluate AI safety" },
      ],
      correct_answer: "C",
      explanation: "The paper's key contribution is identifying which properties of AI model weights differ from software source code: (1) you can't issue a security patch for distributed weights; (2) models have emergent capabilities not visible at training time; (3) weights can directly provide capability uplift to malicious actors in ways that require no additional expertise. All three break the software-openness analogy.",
      display_order: 0,
    },
    {
      question_text: "The 'differential progress' argument for open-sourcing AI claims that safety research benefits more from open access than capability misuse does.",
      question_type: "true_false",
      correct_answer: "true",
      explanation: "Correct — this is one of the strongest arguments for openness. If safety researchers need access to frontier model weights to develop alignment techniques, and bad actors already have access to earlier-generation models sufficient for their purposes, then openness may accelerate safety more than it accelerates risk. Whether this empirical claim is true is contested — Kapoor et al. (2024) try to assess it systematically.",
      display_order: 1,
    },
  ],
};

// ─────────────────────────────────────────────────────────────
// FAKE USERS for seeded discussions
// ─────────────────────────────────────────────────────────────

const FAKE_USERS = [
  { display_name: "kj_morales",  email: "kj.morales@seed.hardproblem.club",  bio: "ML engineer at a fintech. trying to make sense of the philosophy side." },
  { display_name: "priya_v",     email: "priya.v@seed.hardproblem.club",     bio: "CS PhD, HCI focus. lurking until I have something to say." },
  { display_name: "t_brennan",   email: "t.brennan@seed.hardproblem.club",   bio: null },
  { display_name: "alex_wu",     email: "alex.wu@seed.hardproblem.club",     bio: "software at a robotics company. read a lot." },
  { display_name: "sam_okonkwo", email: "sam.okonkwo@seed.hardproblem.club", bio: "ethics & policy. came from law." },
  { display_name: "n_fletcher",  email: "n.fletcher@seed.hardproblem.club",  bio: null },
  { display_name: "dm_reyes",    email: "dm.reyes@seed.hardproblem.club",    bio: "product at a health tech startup. mostly a reader." },
  { display_name: "ch_park",     email: "ch.park@seed.hardproblem.club",     bio: "AI research. here to argue." },
  { display_name: "rob_e",       email: "rob.e@seed.hardproblem.club",       bio: null },
  { display_name: "mira_s",      email: "mira.s@seed.hardproblem.club",      bio: "philosophy + CS undergrad. everything here breaks my brain." },
];

// ─────────────────────────────────────────────────────────────
// SEEDED DISCUSSIONS (topic slug → contributions)
// parent refs use array indices within the topic's list
// ─────────────────────────────────────────────────────────────

const DISCUSSIONS: Record<string, Array<{
  user: string;
  body: string;
  stance_tag?: string;
  parent_index?: number;
  relationship_type?: "build_on" | "reply";
  reaction_type?: "great_point" | "interesting" | "i_disagree" | "thumbs_up";
}>> = {
  "hard-problem-of-consciousness": [
    { user: "kj_morales", body: "The zombie argument never fully clicked for me. The fact that we can describe p-zombies doesn't mean they're actually conceivable — Dennett's point about intentionality undermining the thought experiment seems right. What does 'functionally identical but no experience' even mean if functional organization is all there is?", stance_tag: "Skeptic of the hard problem" },
    { user: "sam_okonkwo", body: "Even if you reject the zombie argument, the explanatory gap survives in a weaker form: we don't have any account of why *this* neural process gives rise to *this* qualitative character and not another. That's not nothing, even for a physicalist.", stance_tag: "Explanatory gap is real" },
    { user: "dm_reyes", body: "The LaMDA thing is exactly why this matters practically. You can't just shrug at the hard problem when you're shipping conversational AI at scale. Whether you want to or not, you're implicitly taking a position." },
    { user: "ch_park", body: "Chalmers anticipates the objection in the first comment — he's not saying zombies are actual, just metaphysically possible. And that possibility claim is all the argument needs. Whether conceivability tracks possibility is the whole debate.", parent_index: 0, relationship_type: "build_on" },
    { user: "priya_v", body: "The LaMDA thing also showed how bad our intuitions are at distinguishing 'sounds conscious' from 'is conscious'. Lemoine's evidence was basically: it said things that seemed meaningful. That bar is trivially low.", parent_index: 2, relationship_type: "build_on" },
    { user: "t_brennan", body: "What I get stuck on: Chalmers calls it a 'hard' problem but then admits we might never solve it. At what point does a permanent explanatory gap become evidence that we're asking the wrong question?", stance_tag: "Deflationary" },
    { user: "n_fletcher", body: "great point", parent_index: 1, relationship_type: "reply", reaction_type: "great_point" },
    { user: "rob_e", body: "interesting", parent_index: 5, relationship_type: "reply", reaction_type: "interesting" },
    { user: "mira_s", body: "Nagel's bat paper is the best entry point for this imo. 'What is it like' framing makes the problem visceral in a way the zombie thought experiment doesn't. You don't need to stipulate anything weird — just ask about echolocation.", stance_tag: "Pro hard problem" },
  ],

  "algorithmic-fairness": [
    { user: "alex_wu", body: "The impossibility result is one of those things that seems obvious in retrospect but changes everything. You can't 'fix' bias by throwing more engineers at it — the tradeoff is structural, not technical.", stance_tag: "Fairness is irreducibly political" },
    { user: "priya_v", body: "The part that gets me is who bears the cost of the metric choice. ProPublica's framing protects individuals from false positives. Northpointe's framing protects institutional accuracy. Those are different beneficiaries.", stance_tag: "Individual fairness first" },
    { user: "n_fletcher", body: "A 45% vs 24% false positive rate split across racial lines isn't a model error — it's a policy choice that someone made, probably without realizing that's what they were doing.", stance_tag: "Equal FPR is non-negotiable" },
    { user: "kj_morales", body: "Even if you equalize FPR, the base rate difference means black defendants face a harsher *system* even with a fair model. Fairness at the model level doesn't touch fairness at the system level.", parent_index: 2, relationship_type: "build_on" },
    { user: "sam_okonkwo", body: "Gender Shades is doing something slightly different from the COMPAS critique — it's showing benchmark bias as a mechanism. The evaluation dataset was skewed, so the model looked good when it wasn't. That's a separate failure mode from the metric tradeoff.", parent_index: 0, relationship_type: "build_on" },
    { user: "dm_reyes", body: "Anyone who's shipped a model that affects real decisions should read Chouldechova first. The impossibility result is the thing I'd want every PM to internalize before writing a fairness requirement.", },
    { user: "ch_park", body: "great point", parent_index: 3, relationship_type: "reply", reaction_type: "great_point" },
    { user: "t_brennan", body: "i disagree", parent_index: 0, relationship_type: "reply", reaction_type: "i_disagree" },
    { user: "mira_s", body: "The intersectionality piece from Gender Shades is undersold. Analyzing race and gender separately would have missed the worst disparities entirely. That's a methodological lesson, not just a fairness lesson.", stance_tag: "Intersectionality matters" },
  ],

  "contextual-integrity": [
    { user: "sam_okonkwo", body: "Nissenbaum's framework handles Clearview better than consent-based approaches. You technically 'consented' to your Instagram photos being public. The contextual integrity analysis explains why that's obviously not enough.", stance_tag: "Contextual norms > consent" },
    { user: "dm_reyes", body: "GDPR's purpose limitation maps onto contextual integrity cleanly. The problem is enforcement — 'compatible purpose' is vague enough that most companies can argue their way through it with a straight face.", },
    { user: "rob_e", body: "Work in health tech. The hardest conversations are always about data reuse — patient consented to X, we want to do Y, Y seems beneficial but the contexts are completely different. This paper gives a vocabulary for exactly why that matters.", stance_tag: "Context matters in practice" },
    { user: "mira_s", body: "The consent framing is circular though. Nissenbaum doesn't need consent as the anchor — she needs contextual norms. The question is who sets those norms and how they update as technology changes.", parent_index: 0, relationship_type: "build_on" },
    { user: "alex_wu", body: "What I want from this framework: an operationalizable test. 'Does this flow match the norms of the original context' is principled but hard to apply in product reviews. The FTC needs something they can put in a checklist.", stance_tag: "Need practical operationalization" },
    { user: "n_fletcher", body: "The aggregation problem is where it gets genuinely novel. Each piece is shared in a legitimate context. Combining them creates something that *no* context authorized. You can't solve that by going back to individual consent.", parent_index: 0, relationship_type: "build_on" },
    { user: "kj_morales", body: "interesting", parent_index: 4, relationship_type: "reply", reaction_type: "interesting" },
    { user: "ch_park", body: "great point", parent_index: 5, relationship_type: "reply", reaction_type: "great_point" },
    { user: "t_brennan", body: "The real-world anchor here is interesting — Clearview's defense was basically 'the data was public.' That argument has now been rejected by multiple national DPAs. The contextual integrity analysis predicted this outcome before the enforcement.", stance_tag: "Framework validated by enforcement" },
  ],

  "ai-moral-status": [
    { user: "ch_park", body: "Schwitzgebel's argument is conditional in a way that's easy to miss. He's not claiming current AI is conscious — he's saying if functionalism is right (which most secular philosophers already accept), we have a coming problem.", },
    { user: "alex_wu", body: "The asymmetry argument is doing a lot of work. 'The cost of treating non-sentient AI as sentient is modest' — but if you extend moral consideration broadly enough you hit real constraints on what you can build, test, and deploy.", stance_tag: "Asymmetry argument overstated" },
    { user: "priya_v", body: "Searle's response proves too much. If syntax can't generate semantics, that also applies to neurons — they're physical stuff running physical processes. Either both have semantics or neither does. The Chinese Room just relocates the mystery.", stance_tag: "Functionalism holds" },
    { user: "mira_s", body: "The precautionary framing might be the right move under genuine uncertainty. If we're at maybe-5% on current systems, and the cost of being wrong is enormous, liability frameworks before certainty seems reasonable.", parent_index: 1, relationship_type: "build_on" },
    { user: "kj_morales", body: "Anthropic's model welfare commitments are interesting in this context — they're not claiming Claude is conscious, but they're not betting against it either. That's exactly the epistemic position the asymmetry argument recommends.", parent_index: 0, relationship_type: "build_on" },
    { user: "sam_okonkwo", body: "The harder question is what 'moral consideration' would even cash out to in practice for AI systems. Not training them on disturbing content? Not deleting them? It's philosophically live but the practical implications are unclear.", stance_tag: "Practical implications unclear" },
    { user: "rob_e", body: "great point", parent_index: 2, relationship_type: "reply", reaction_type: "great_point" },
    { user: "dm_reyes", body: "interesting", parent_index: 4, relationship_type: "reply", reaction_type: "interesting" },
    { user: "n_fletcher", body: "The substrate independence concept is what makes this tractable at all. If mind requires neurons specifically, the question is empirically closed. If substrate independence holds, it's wide open — and functionalism is already the mainstream position.", stance_tag: "Substrate independence is key" },
  ],

  "echo-chambers-epistemic-autonomy": [
    { user: "mira_s", body: "The epistemic bubble vs echo chamber distinction is actually useful. An epistemic bubble you can escape by just being exposed to outside information. An echo chamber trains you to distrust outside sources — it's self-sealing. Completely different intervention needed.", stance_tag: "Distinction matters" },
    { user: "t_brennan", body: "Value capture is the most interesting concept here. I've watched colleagues who used to want to do good research start optimizing for h-index in ways that genuinely changed what they worked on. The goal didn't just shift — it was replaced.", },
    { user: "n_fletcher", body: "The LLM training angle seems significant. If we fine-tune on human feedback from people who've already been value-captured by Twitter, we're not training on what people value — we're training on what people have been shaped to express.", stance_tag: "RLHF implications" },
    { user: "alex_wu", body: "Not convinced platform design is the right lever. The engagement-as-proxy-for-value problem predates social media — it's basically any performance metric in any institution. Citations, KPIs, quarterly earnings. The algorithm makes it faster, not qualitatively different.", stance_tag: "Not platform-specific" },
    { user: "kj_morales", body: "The speed matters though. These platforms can A/B test their way to maximum engagement in weeks. Traditional institutional value capture takes decades. The velocity changes what's recoverable.", parent_index: 3, relationship_type: "build_on" },
    { user: "priya_v", body: "interesting", parent_index: 2, relationship_type: "reply", reaction_type: "interesting" },
    { user: "ch_park", body: "great point", parent_index: 4, relationship_type: "reply", reaction_type: "great_point" },
    { user: "sam_okonkwo", body: "The epistemic coercion concept is doing real work for explaining political polarization. You're not just in a bubble — the community actively punishes nuanced takes. Anyone who's written 'it's complicated' on a political topic online knows exactly what he's describing.", stance_tag: "Empirically observable" },
    { user: "dm_reyes", body: "What's the exit? If value capture replaces what you want, not just how you achieve it, debiasing techniques don't work. Nguyen doesn't seem to have a strong answer here.", stance_tag: "Exit unclear" },
    { user: "rob_e", body: "i disagree", parent_index: 3, relationship_type: "reply", reaction_type: "i_disagree" },
  ],

  "responsibility-gap": [
    { user: "alex_wu", body: "The Tesla/Uber cases are textbook. Engineers didn't design the specific failure mode. The safety driver wasn't driving. The regulator didn't have a framework. Real harm, zero clear moral author.", },
    { user: "ch_park", body: "I'm skeptical the gap is as clean as Matthias presents. The decision to deploy a learning system in a safety-critical context, knowing it will produce unanticipated behaviors, seems like a morally significant act. Deploying is where the responsibility lives.", stance_tag: "Deployment is the responsible act" },
    { user: "priya_v", body: "Coeckelbergh's distributed responsibility response is more useful practically. You stop asking 'who is the single responsible agent' and start mapping the network. Different obligations for different nodes.", stance_tag: "Distributed > individual" },
    { user: "t_brennan", body: "The responsibility gap widens with capability. GPT-2 surprising outputs: philosophically interesting. Autonomous weapon producing unexpected lethal output: completely different stakes. The framework needs to scale.", parent_index: 0, relationship_type: "build_on" },
    { user: "n_fletcher", body: "Nissenbaum's 'many hands' paper from 1994 anticipated this. The computing industry had already normalized responsibility diffusion. Matthias is applying that to a new context rather than identifying something new.", parent_index: 0, relationship_type: "build_on" },
    { user: "sam_okonkwo", body: "From a legal perspective, strict liability is the obvious fix. You deploy it, you're liable regardless of foreseeability. No responsibility gap, no philosophical hand-wringing. Product liability for autonomous systems.", stance_tag: "Legal strict liability" },
    { user: "mira_s", body: "great point", parent_index: 2, relationship_type: "reply", reaction_type: "great_point" },
    { user: "kj_morales", body: "thumbs up", parent_index: 5, relationship_type: "reply", reaction_type: "thumbs_up" },
    { user: "dm_reyes", body: "The deployment point is where I land. You can't be responsible for every emergent behavior, but you can be responsible for the decision to deploy something you can't fully predict in contexts where that matters.", stance_tag: "Deploy decision is key" },
    { user: "rob_e", body: "interesting", parent_index: 4, relationship_type: "reply", reaction_type: "interesting" },
  ],

  "cognitive-liberty-neurorights": [
    { user: "priya_v", body: "The Chile neurorights amendment is wild — they moved from philosophy paper to constitutional protection in under a decade. Most rights take centuries. Something about the pace of the technology is forcing the legal timeline.", },
    { user: "dm_reyes", body: "The Amazon wristband case is the right real-world anchor. It makes the abstract concrete: when your employer's system can read and respond to your emotional state, what part of your inner life is yours?", stance_tag: "Workplace is the frontline" },
    { user: "sam_okonkwo", body: "The Fifth Amendment extension argument is interesting but fragile. The amendment protects against compelled *testimonial* self-incrimination. Courts have already allowed compelled DNA, breath tests, fingerprints. Neural data could go either way.", stance_tag: "Legal argument uncertain" },
    { user: "ch_park", body: "Crockett's counter is worth taking seriously — current neuroscience is nowhere near reliable enough to ground the rights claims Farahany is making. Population-level fMRI results don't transfer to individuals. We might be solving a problem we don't yet have.", stance_tag: "Technology not there yet" },
    { user: "n_fletcher", body: "The 'not there yet' defense has consistently failed in tech ethics. By the time it's 'there', the legal frameworks aren't ready. Farahany's point is precisely that you need the rights infrastructure before the technology matures.", parent_index: 3, relationship_type: "build_on" },
    { user: "mira_s", body: "The two threats (disclosure vs alteration) are worth keeping separate. Cognitive liberty in the disclosure sense extends existing privacy law. Cognitive liberty in the alteration sense is genuinely novel — there's no analog in current rights frameworks.", parent_index: 0, relationship_type: "build_on" },
    { user: "alex_wu", body: "great point", parent_index: 4, relationship_type: "reply", reaction_type: "great_point" },
    { user: "kj_morales", body: "interesting", parent_index: 5, relationship_type: "reply", reaction_type: "interesting" },
    { user: "t_brennan", body: "Neuralink is the live case. They're collecting neural data at a fidelity no previous technology approached. Musk has been explicit about long-term goals that involve much richer brain-computer integration. The cognitive liberty framework directly applies.", stance_tag: "Neuralink is the test case" },
    { user: "rob_e", body: "thumbs up", parent_index: 1, relationship_type: "reply", reaction_type: "thumbs_up" },
  ],

  "dark-patterns-digital-manipulation": [
    { user: "dm_reyes", body: "The Amazon Prime cancellation case is the cleanest example. They internally named it the 'Iliad flow' — the long path you have to take to cancel. That naming proves intent. Hard to argue that was accidental design.", },
    { user: "alex_wu", body: "The interesting tension with Sunstein/Thaler: if choice architecture is unavoidable, then the question isn't whether to manipulate but whether your manipulation serves users or exploits them. The nudge framework actually assumes good-faith architects.", stance_tag: "Nudge framework requires good faith" },
    { user: "kj_morales", body: "The A/B testing mechanism changes the moral calculus. If you discover a dark pattern by testing rather than designing it, can you claim you didn't intend it? At some point 'we found it worked' is sufficient evidence of intent to use it.", stance_tag: "Testing reveals intent" },
    { user: "priya_v", body: "Calo's personalization point is what makes digital manipulation structurally different. Traditional manipulation is population-level. Digital is individual-level at scale. A salesperson who knew your specific vulnerabilities would be obviously manipulative. That's what these systems do.", parent_index: 0, relationship_type: "build_on" },
    { user: "n_fletcher", body: "The Mathur et al. crawl is useful data — over 11k sites, 1800+ instances. That's not a bug. That's a feature of the business model. You don't accidentally implement 1800 separate manipulation patterns.", parent_index: 0, relationship_type: "build_on" },
    { user: "ch_park", body: "thumbs up", parent_index: 2, relationship_type: "reply", reaction_type: "thumbs_up" },
    { user: "sam_okonkwo", body: "The FTC enforcement is a start but the regulatory bandwidth is way too small for the scale. $25M fine for a $1.5T company is noise. Structural remedies — default settings, required easy exit flows — seem more promising than fines.", stance_tag: "Structural remedies needed" },
    { user: "t_brennan", body: "great point", parent_index: 3, relationship_type: "reply", reaction_type: "great_point" },
    { user: "mira_s", body: "The consent failure mode Calo identifies is the real knife: consent can't legitimate manipulation that operates on the consent mechanism itself. A 'Reject All' button designed to be hard to find is using consent as a weapon against itself.", stance_tag: "Consent fails here" },
    { user: "rob_e", body: "interesting", parent_index: 8, relationship_type: "reply", reaction_type: "interesting" },
  ],

  "open-source-ai-safety-openness": [
    { user: "ch_park", body: "The Llama fine-tuning strip was predictable. The question was never 'will this happen' but 'how does the benefit/harm math work given that it will.' Meta's answer is that diffuse safety research benefits outweigh concentrated misuse risks. That's empirically testable — has anyone tested it?", stance_tag: "Empirically testable" },
    { user: "alex_wu", body: "The Kapoor et al. response is the right move. Stop arguing in the abstract about whether openness is good or bad and actually measure the marginal uplift. So far the evidence is that open models don't provide meaningful uplift for the worst use cases — those require capabilities that current open models lack.", stance_tag: "Openness defensible" },
    { user: "n_fletcher", body: "The irreversibility argument is the strongest case against openness. Software vulnerabilities can be patched. Weights can't. Once Llama 2 is out, any future discoveries about its dangerous capabilities can't be remediated. That asymmetry seems significant.", stance_tag: "Irreversibility is decisive" },
    { user: "priya_v", body: "The Seger paper is careful about which risks matter. It's not general misuse — it's specifically CBRN uplift and a few other catastrophic-potential categories. For those specific uses, the marginal uplift question is different because the actors are highly capable and persistent.", parent_index: 1, relationship_type: "build_on" },
    { user: "sam_okonkwo", body: "From a governance angle, the 'structured access' alternative is the most interesting idea in the debate. Not fully open, not fully closed — tiered access with accountability. The problem is enforcing it globally against actors who don't care about your access regime.", stance_tag: "Structured access is the answer" },
    { user: "kj_morales", body: "Differential progress argument has always seemed a bit convenient to me. Safety researchers say they need open access to do safety research. But the labs doing safety research also happen to be the labs releasing the models. There's a selection effect.", parent_index: 0, relationship_type: "build_on" },
    { user: "mira_s", body: "great point", parent_index: 5, relationship_type: "reply", reaction_type: "great_point" },
    { user: "t_brennan", body: "i disagree", parent_index: 1, relationship_type: "reply", reaction_type: "i_disagree" },
    { user: "dm_reyes", body: "The EU AI Act treatment of open-source models was a last-minute carve-out under industry pressure. It's not a principled resolution — it's a political compromise. The debate is going to continue every time a new frontier model is released.", stance_tag: "Policy hasn't resolved this" },
    { user: "rob_e", body: "interesting", parent_index: 2, relationship_type: "reply", reaction_type: "interesting" },
  ],
};

// ─────────────────────────────────────────────────────────────
// RUNNER
// ─────────────────────────────────────────────────────────────

async function run() {
  console.log("=== Hard Problem Expansion Seed ===\n");

  // ── 0. Update videos on existing topics ───────────────────
  console.log("Updating videos on existing topics...");
  for (const [slug, videos] of Object.entries(VIDEO_UPDATES)) {
    const { error } = await sb.from("topics").update({ videos }).eq("slug", slug);
    if (error) console.error(`  ✗ ${slug}: ${error.message}`);
    else console.log(`  ✓ ${slug}`);
  }

  // ── 1. Upsert new topics ───────────────────────────────────
  console.log("\nInserting new topics...");
  const topicIdMap: Record<string, string> = {};

  // Also fetch existing topic IDs for discussions
  const { data: existing } = await sb.from("topics").select("id, slug");
  for (const t of existing ?? []) topicIdMap[t.slug] = t.id;

  for (const t of NEW_TOPICS) {
    const { data, error } = await sb
      .from("topics")
      .upsert(
        {
          slug: t.slug, title: t.title, status: t.status,
          difficulty: t.difficulty, domains: t.domains,
          sequence_number: t.sequence_number, framing_note: t.framing_note,
          discussion_prompt: t.discussion_prompt,
          real_world_anchor: t.real_world_anchor,
          videos: t.videos,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "slug" },
      )
      .select("id, slug").single();
    if (error) { console.error(`  ✗ ${t.slug}: ${error.message}`); continue; }
    topicIdMap[t.slug] = data.id;
    console.log(`  ✓ ${t.slug}`);
  }

  // ── 2. Papers for new topics ───────────────────────────────
  console.log("\nInserting papers...");
  for (const [slug, papers] of Object.entries(NEW_PAPERS)) {
    const topicId = topicIdMap[slug];
    if (!topicId) continue;
    for (const p of papers as any[]) {
      await sb.from("papers").delete().eq("topic_id", topicId).eq("title", p.title);
      const { error } = await sb.from("papers").insert({ ...p, topic_id: topicId });
      if (error) console.error(`  ✗ ${(p as any).title}: ${error.message}`);
      else console.log(`  ✓ [${slug}] ${(p as any).authors?.split(",")[0]} (${(p as any).year})`);
    }
  }

  // ── 3. Concepts for new topics ─────────────────────────────
  console.log("\nInserting concepts...");
  for (const c of NEW_CONCEPTS) {
    const { data: concept, error } = await sb
      .from("concepts")
      .upsert({ term: c.term, slug: c.slug, definition: c.definition, examples: c.examples, related_terms: c.related_terms, updated_at: new Date().toISOString() }, { onConflict: "slug" })
      .select("id").single();
    if (error) { console.error(`  ✗ ${c.term}: ${error.message}`); continue; }
    console.log(`  ✓ ${c.term}`);
    for (const topicSlug of c.topics) {
      const topicId = topicIdMap[topicSlug];
      if (!topicId) continue;
      await sb.from("topic_concepts").upsert({ topic_id: topicId, concept_id: concept.id }, { onConflict: "topic_id,concept_id" });
    }
  }

  // ── 4. Quiz questions for new topics ──────────────────────
  console.log("\nInserting quiz questions...");
  for (const [slug, questions] of Object.entries(NEW_QUIZ)) {
    const topicId = topicIdMap[slug];
    if (!topicId) continue;
    await sb.from("quiz_questions").delete().eq("topic_id", topicId);
    for (const q of questions as any[]) {
      const { error } = await sb.from("quiz_questions").insert({ ...q, topic_id: topicId });
      if (error) console.error(`  ✗ quiz [${slug}]: ${error.message}`);
      else console.log(`  ✓ [${slug}] Q${(q as any).display_order + 1}`);
    }
  }

  // ── 5. Fake users ──────────────────────────────────────────
  console.log("\nCreating seed users...");
  const userIdMap: Record<string, string> = {};
  for (const u of FAKE_USERS) {
    const { data, error } = await sb
      .from("users")
      .upsert({ email: u.email, display_name: u.display_name, bio: u.bio }, { onConflict: "email" })
      .select("id, display_name").single();
    if (error) { console.error(`  ✗ ${u.display_name}: ${error.message}`); continue; }
    userIdMap[u.display_name] = data.id;
    console.log(`  ✓ ${u.display_name}`);
  }

  // ── 6. Discussions ─────────────────────────────────────────
  console.log("\nSeeding discussions...");
  for (const [topicSlug, posts] of Object.entries(DISCUSSIONS)) {
    const topicId = topicIdMap[topicSlug];
    if (!topicId) { console.warn(`  ⚠ no topic id for ${topicSlug}`); continue; }

    // Delete existing seeded contributions for this topic (idempotent)
    const seedEmails = FAKE_USERS.map(u => u.email);
    const { data: seedUserIds } = await sb.from("users").select("id").in("email", seedEmails);
    const ids = (seedUserIds ?? []).map(u => u.id);
    if (ids.length > 0) {
      await sb.from("contributions").delete().eq("topic_id", topicId).in("user_id", ids);
    }

    const insertedIds: (string | null)[] = [];

    for (const post of posts) {
      const userId = userIdMap[post.user];
      if (!userId) { insertedIds.push(null); continue; }

      const isReply = post.relationship_type === "reply";
      const parentId = post.parent_index !== undefined ? insertedIds[post.parent_index] : null;

      const row: Record<string, unknown> = {
        topic_id: topicId,
        user_id: userId,
        parent_id: parentId,
        relationship_type: post.relationship_type ?? null,
        body: isReply ? null : post.body,
        reaction_type: isReply ? post.reaction_type ?? null : null,
        stance_tag: post.stance_tag ?? null,
        created_at: new Date(Date.now() - Math.floor(Math.random() * 7 * 24 * 60 * 60 * 1000)).toISOString(),
      };

      const { data, error } = await sb.from("contributions").insert(row).select("id").single();
      if (error) {
        console.error(`  ✗ [${topicSlug}] ${post.user}: ${error.message}`);
        insertedIds.push(null);
      } else {
        insertedIds.push(data.id);
      }
    }

    const ok = insertedIds.filter(Boolean).length;
    console.log(`  ✓ [${topicSlug}] ${ok}/${posts.length} contributions`);
  }

  console.log("\n=== Done ===");
}

run().catch(e => { console.error(e); process.exit(1); });
