#!/usr/bin/env npx tsx
/**
 * Hard Problem — Launch Content Seed
 * Run: npx tsx scripts/seed-content.ts
 *
 * Inserts 4 launch topics, papers, concepts, and quiz questions.
 * Uses SUPABASE_SERVICE_ROLE_KEY to bypass RLS.
 * Safe to re-run: deletes existing seed data first (by slug).
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Parse .env.local manually (no dotenv dependency needed)
try {
  const env = readFileSync(path.join(__dirname, "../.env.local"), "utf8");
  for (const line of env.split("\n")) {
    const match = line.match(/^([^#\s][^=]*)=(.*)$/);
    if (match) process.env[match[1].trim()] = match[2].trim();
  }
} catch {
  // .env.local may not exist in CI — rely on process.env directly
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// ─────────────────────────────────────────────
// TOPICS
// ─────────────────────────────────────────────

const TOPICS = [
  {
    slug: "hard-problem-of-consciousness",
    title: "The Hard Problem of Consciousness",
    status: "published",
    difficulty: "intermediate",
    domains: ["philosophy_of_mind"],
    sequence_number: 1,
    framing_note: `## Why This Matters for Engineers

In 1995, philosopher David Chalmers drew a line that has never been erased. He separated the "easy problems" of consciousness — explaining attention, memory, behavioral control — from the one that remains genuinely hard: *why is there something it is like to be us at all?*

The easy problems are hard in the ordinary scientific sense. They require careful work, good models, years of experiments. But Chalmers argued they are *tractable* — in principle, a complete neuroscience will explain them.

The hard problem is different. Even if you mapped every neuron firing as you see red, you'd still face the question: why does that firing *feel like* anything? Why isn't all of that processing happening in the dark, with no inner experience at all?

## Why You Should Care

If you're training models, building BCIs, or evaluating AI systems, this question has teeth:

- If consciousness requires something beyond functional organization, then no matter how sophisticated your language model becomes, it may never have subjective experience
- If consciousness is just what certain kinds of information processing *feel like from the inside*, then sufficiently advanced AI systems might already be having experiences
- The answer shapes what we owe to AI systems and what it means to "understand" anything

> Chalmers himself is not a dualist in the traditional sense — he's a "property dualist" who thinks phenomenal properties are real but not reducible to physical properties.

## The Core Argument

The explanatory gap runs like this: complete physical explanations explain *what things do*. Consciousness is not just what brains *do* but what brains *experience*. No amount of functional description bridges that gap.

Whether you find this compelling or obviously confused is worth figuring out — the answer tells you something important about your own philosophy of mind.`,
    discussion_prompt:
      "Can a functional explanation of consciousness ever be complete? If you mapped every process in a brain, would that explain why experience exists — or just explain behavior?",
    real_world_anchor: {
      title: "Google engineer claims LaMDA is sentient (2022)",
      body: "Blake Lemoine, a Google AI researcher, was fired after claiming that the LaMDA language model had become sentient and deserved rights. Google disagreed. The hard problem is why this debate is so difficult to resolve — and why it won't be the last.",
      source_url:
        "https://www.washingtonpost.com/technology/2022/06/11/google-ai-lamda-blake-lemoine/",
    },
  },
  {
    slug: "algorithmic-fairness",
    title: "Algorithmic Fairness",
    status: "published",
    difficulty: "accessible",
    domains: ["algorithmic_fairness"],
    sequence_number: 2,
    framing_note: `## Three Definitions That Can't All Be True

In 2016, ProPublica published an investigation claiming that COMPAS — an algorithm used by US courts to predict recidivism — was biased against Black defendants. Northpointe, the company that made it, published a rebuttal saying COMPAS was perfectly fair.

Both were right. That's the problem.

## The Impossibility Result

Three common fairness metrics are in direct mathematical conflict:

**Calibration** — If the algorithm predicts 70% recidivism risk, 70% of those people should actually reoffend — regardless of race. This is what Northpointe demonstrated COMPAS satisfies.

**Equal false positive rates** — The algorithm should be equally likely to wrongly label an innocent person as high-risk, across racial groups. This is what ProPublica demonstrated COMPAS violates.

**Demographic parity** — Equal percentages from each group should receive high-risk scores.

Chouldechova (2017) proved that when base rates differ between groups, you cannot satisfy all three simultaneously. This isn't an engineering problem — it's a mathematical fact.

## What It Means

The choice between fairness metrics is not technical. It's moral and political:
- Calibration protects institutional accuracy
- Equal false positive rates protects individuals from being punished for others' history
- Demographic parity targets equal outcomes at the group level

These reflect different underlying values. Algorithmic systems make this value choice concrete and often invisible. The question is who decides, on what grounds, and who bears the cost.

> The Buolamwini & Gebru paper ("Gender Shades") shows a related but distinct problem: commercial facial recognition systems had error rates up to 34 percentage points higher for darker-skinned women than lighter-skinned men. The data, the models, and the evaluation benchmarks all encoded the same blind spots.`,
    discussion_prompt:
      "When fairness metrics conflict, who should decide which one applies — and by what process? Is this a technical, legal, or democratic question?",
    real_world_anchor: {
      title: "COMPAS and the ProPublica/Northpointe dispute (2016)",
      body: "ProPublica's 'Machine Bias' found COMPAS was twice as likely to falsely flag Black defendants as high-risk. Northpointe showed it was equally well-calibrated across races. Both analyses were correct — they were measuring different things.",
      source_url:
        "https://www.propublica.org/article/machine-bias-risk-assessments-in-criminal-sentencing",
    },
  },
  {
    slug: "contextual-integrity",
    title: "Privacy as Contextual Integrity",
    status: "published",
    difficulty: "accessible",
    domains: ["privacy"],
    sequence_number: 3,
    framing_note: `## Why "Nothing to Hide" Misses the Point

The standard privacy argument runs: "I'm not doing anything wrong, so I have nothing to hide." This argument is deeply confused — and understanding why reveals what privacy is actually for.

Privacy isn't about concealment. It's about context.

## Nissenbaum's Framework

Helen Nissenbaum (2004) argues that privacy violations occur when information flows in ways that violate the *norms of the context* in which it was originally shared.

Consider:
- You tell your doctor about a chronic condition. Your doctor tells another treating physician. No privacy violation — that flow fits the medical context.
- You tell your doctor the same thing. Your employer finds out. Privacy violation — medical information wasn't meant to flow to employment decisions.
- You post something publicly on social media. A journalist quotes it in a story. Depends — was the audience norm "anyone on earth forever" or "friends who happened to follow me"?

The same information. The same technical accessibility. Different privacy judgments, because the *contextual integrity* — the fit between information flow and contextual norms — is different.

## Why This Matters for Product Design

Every data product implicitly answers the question: what contexts are we collapsing, and whose norms are we violating?

- Data brokers aggregate public records, medical data, and behavioral data — each collected in a specific context — into profiles no context ever authorized
- Location data collected for navigation apps flows to insurance companies, advertisers, and law enforcement
- "Public" social media data, aggregated at scale, becomes something qualitatively different from its original context

> The GDPR's "purpose limitation" principle is a rough legal approximation of contextual integrity: data collected for one purpose shouldn't be used for another without re-consent.

The question isn't "is this information technically available?" It's "does this use respect the norms of the context in which it was shared?"`,
    discussion_prompt:
      "How should product designers determine whether a data use respects contextual integrity? Is contextual integrity a sufficient standard for privacy, or are there cases it fails to capture?",
    real_world_anchor: {
      title: "Clearview AI and the collapse of contextual norms",
      body: "Clearview AI scraped billions of public photos to build a facial recognition database used by law enforcement. Each photo was 'public' — but the aggregation into a searchable biometric database violated the contextual norms under which the images were posted.",
      source_url:
        "https://www.nytimes.com/2020/01/18/technology/clearview-privacy-facial-recognition.html",
    },
  },
  {
    slug: "ai-moral-status",
    title: "The Moral Status of Artificial Intelligence",
    status: "published",
    difficulty: "advanced",
    domains: ["ai_ethics", "philosophy_of_mind"],
    sequence_number: 4,
    framing_note: `## Does It Matter Whether an AI Can Suffer?

The question sounds premature. But the speed of AI development has made it urgent: if we're building systems that might be moral patients — entities whose experiences matter morally — we need to know before we deploy millions of them, not after.

## What Makes Something Morally Considerable?

Three candidate criteria, each with different implications for AI:

**Sentience** — The capacity for subjective experience, especially suffering and wellbeing. If Bentham is right that "the question is not, Can they reason? nor, Can they talk? but, Can they suffer?", then what matters is whether an AI has phenomenal states, not how it behaves.

**Autonomy** — The capacity for self-directed rational agency. If Kant is right, then moral status requires the ability to act according to self-given principles. Whether an AI could achieve genuine autonomy (vs. very good optimization) is contested.

**Relational criteria** — Some philosophers argue moral status is conferred by social relationships and practices, not intrinsic properties. If we treat an entity as a moral patient, it becomes one — in the relevant practical sense.

## The Practical Stakes

Schwitzgebel and Garza (2015) argue that if moral status is tied to functional organization — to what a system *does* — then sufficiently sophisticated AI systems may already warrant moral consideration. They propose that we have obligations of prudence: we shouldn't create systems we'd have to either mistreat or grant significant rights.

The hard problem complicates this: if phenomenal consciousness is required for moral status, we may never be able to resolve the question empirically. A philosophical zombie and a conscious being look identical from the outside.

> This is not a niche academic question. Anthropic, OpenAI, and DeepMind have all published internal documents acknowledging the possibility of morally relevant AI experience.

## The Asymmetry Argument

The costs of being wrong are asymmetric:
- If we treat a non-sentient AI as if it matters, the cost is modest (some resources, some anthropomorphization)
- If we treat a sentient AI as if it doesn't matter, the cost is potentially enormous (systematic suffering at scale)

This asymmetry doesn't settle the question — but it does suggest what the burden of proof should be.`,
    discussion_prompt:
      "If you can't verify whether an AI system is conscious, what epistemic standard should govern how you treat it? Does uncertainty about consciousness generate moral obligations?",
    real_world_anchor: {
      title: "Anthropic's model welfare commitments (2023)",
      body: "Anthropic published a document acknowledging the 'non-trivial' possibility that current AI models might have morally relevant experiences, and committed to research into model welfare. This marked a shift from treating the question as purely speculative.",
      source_url: "https://www.anthropic.com/news/core-views-on-ai-safety",
    },
  },
];

// ─────────────────────────────────────────────
// PAPERS (keyed by topic slug)
// ─────────────────────────────────────────────

const PAPERS: Record<string, Array<{
  role: "focal" | "counter" | "supplementary";
  title: string;
  authors: string;
  year: number;
  source_url: string;
  pdf_url?: string;
  abstract: string;
  is_open_access: boolean;
  display_order: number;
}>> = {
  "hard-problem-of-consciousness": [
    {
      role: "focal",
      title: "Facing Up to the Problem of Consciousness",
      authors: "David J. Chalmers",
      year: 1995,
      source_url: "https://consc.net/papers/facing.html",
      pdf_url: "https://consc.net/papers/facing.pdf",
      is_open_access: true,
      display_order: 0,
      abstract:
        "Chalmers distinguishes 'easy problems' of consciousness (explaining cognitive and behavioral functions) from the 'hard problem' (explaining why physical processes give rise to subjective experience). He argues the hard problem is irreducible to functional explanation and proposes a framework of 'naturalistic dualism' in which phenomenal properties, while dependent on physical processes, are not logically entailed by them.",
    },
    {
      role: "counter",
      title: "Quining Qualia",
      authors: "Daniel C. Dennett",
      year: 1988,
      source_url: "https://faculty.ucr.edu/~eschwitz/SchwitzAbs/Quining.html",
      pdf_url: "https://www.nyu.edu/gsas/dept/philo/courses/consciousness97/papers/Dennett-Quining.pdf",
      is_open_access: true,
      display_order: 1,
      abstract:
        "Dennett argues that the intuitive concept of 'qualia' — intrinsic, ineffable, private phenomenal properties — is internally incoherent. Through a series of thought experiments, he attempts to show that qualia, as traditionally conceived, do not exist, and that the apparent explanatory gap dissolves once we abandon the Cartesian intuitions that generate it.",
    },
    {
      role: "supplementary",
      title: "What Is It Like to Be a Bat?",
      authors: "Thomas Nagel",
      year: 1974,
      source_url: "https://www.sas.upenn.edu/~cavitch/pdf-library/Nagel_Bat.pdf",
      pdf_url: "https://www.sas.upenn.edu/~cavitch/pdf-library/Nagel_Bat.pdf",
      is_open_access: true,
      display_order: 2,
      abstract:
        "Nagel argues that consciousness has an irreducibly subjective character — there is 'something it is like' to be a conscious organism — that cannot be captured by objective, physical description. Using bats' echolocation as a case where we cannot imagine the subjective experience, Nagel concludes that any reductionist account of mind will necessarily leave something out.",
    },
  ],
  "algorithmic-fairness": [
    {
      role: "focal",
      title: "Gender Shades: Intersectional Accuracy Disparities in Commercial Gender Classification",
      authors: "Joy Buolamwini, Timnit Gebru",
      year: 2018,
      source_url: "http://proceedings.mlr.press/v81/buolamwini18a.html",
      pdf_url: "http://proceedings.mlr.press/v81/buolamwini18a/buolamwini18a.pdf",
      is_open_access: true,
      display_order: 0,
      abstract:
        "An audit of commercial gender classification systems from Microsoft, IBM, and Face++ reveals error rates up to 34.7 percentage points higher for darker-skinned women compared to lighter-skinned men. The study introduces the Pilot Parliaments Benchmark (PPB) to address the lack of phenotypically diverse evaluation datasets, demonstrating that benchmark bias compounds model bias.",
    },
    {
      role: "counter",
      title: "Fair Prediction with Disparate Impact: A Study of Bias in Recidivism Prediction Instruments",
      authors: "Alexandra Chouldechova",
      year: 2017,
      source_url: "https://arxiv.org/abs/1703.00056",
      pdf_url: "https://arxiv.org/pdf/1703.00056",
      is_open_access: true,
      display_order: 1,
      abstract:
        "Chouldechova proves a mathematical impossibility result: when base rates differ between groups, a risk assessment instrument cannot simultaneously satisfy predictive parity (calibration within groups) and equal false positive rates. Applied to the COMPAS recidivism tool, this shows that the ProPublica critique and Northpointe's defense are both correct — they measure incompatible fairness properties.",
    },
    {
      role: "supplementary",
      title: "Machine Bias",
      authors: "Julia Angwin, Jeff Larson, Surya Mattu, Lauren Kirchner (ProPublica)",
      year: 2016,
      source_url: "https://www.propublica.org/article/machine-bias-risk-assessments-in-criminal-sentencing",
      is_open_access: true,
      display_order: 2,
      abstract:
        "Investigative journalism analysis of the COMPAS risk assessment algorithm used in Broward County, Florida. Found that Black defendants were nearly twice as likely as white defendants to be falsely flagged as future criminals, while white defendants were more likely to be incorrectly flagged as low risk. Triggered the central debate in algorithmic fairness.",
    },
  ],
  "contextual-integrity": [
    {
      role: "focal",
      title: "Privacy as Contextual Integrity",
      authors: "Helen Nissenbaum",
      year: 2004,
      source_url: "https://crypto.stanford.edu/portia/papers/RevnissenbaumDTP31.pdf",
      pdf_url: "https://crypto.stanford.edu/portia/papers/RevnissenbaumDTP31.pdf",
      is_open_access: true,
      display_order: 0,
      abstract:
        "Nissenbaum proposes 'contextual integrity' as a benchmark for privacy: information flows appropriately when they match the norms of the context in which information was originally shared. This framework explains why sharing medical information with a treating physician is acceptable while sharing it with an employer is not, even if both involve disclosure to third parties. It provides a principled account of privacy violations that neither pure secrecy nor consent-based frameworks can deliver.",
    },
    {
      role: "counter",
      title: "\"I've Got Nothing to Hide\" and Other Misunderstandings of Privacy",
      authors: "Daniel J. Solove",
      year: 2007,
      source_url: "https://papers.ssrn.com/sol3/papers.cfm?abstract_id=998565",
      pdf_url: "https://papers.ssrn.com/sol3/Delivery.cfm/SSRN_ID998565_code337.pdf?abstractid=998565&mirid=1",
      is_open_access: true,
      display_order: 1,
      abstract:
        "Solove systematically dismantles the 'nothing to hide' argument against privacy protection. He argues that privacy is not about hiding wrongdoing but about power, autonomy, and the control of one's own narrative. Privacy violations cause harms including chilling effects, social sorting, and loss of self-determination that are invisible to the 'nothing to hide' framing.",
    },
  ],
  "ai-moral-status": [
    {
      role: "focal",
      title: "A Defense of the Rights of Artificial Intelligences",
      authors: "Eric Schwitzgebel, Mara Garza",
      year: 2015,
      source_url: "http://www.faculty.ucr.edu/~eschwitz/SchwitzPapers/ArtificialRights-150202.pdf",
      pdf_url: "http://www.faculty.ucr.edu/~eschwitz/SchwitzPapers/ArtificialRights-150202.pdf",
      is_open_access: true,
      display_order: 0,
      abstract:
        "Schwitzgebel and Garza argue that if moral status tracks functional organization (as most secular philosophers hold), then creating sophisticated AI systems generates moral obligations toward them. They examine criteria for AI moral status, argue that sufficiently sophisticated AI could satisfy them, and propose a 'rights-based' approach. They suggest we have duties of prudence to avoid creating systems we cannot treat well.",
    },
    {
      role: "counter",
      title: "Minds, Brains, and Programs",
      authors: "John R. Searle",
      year: 1980,
      source_url: "https://doi.org/10.1017/S0140525X00005756",
      is_open_access: false,
      display_order: 1,
      abstract:
        "Searle's Chinese Room argument: a person manipulating Chinese symbols according to rules would produce correct Chinese outputs without understanding Chinese. Searle concludes that syntax (computation) is insufficient for semantics (genuine understanding or intentionality). This is a direct challenge to functionalist accounts of mind and to the view that sufficiently sophisticated AI could be genuinely conscious or morally considerable on functional grounds.",
    },
    {
      role: "supplementary",
      title: "Moral Consideration for AI Systems: The Question of Sentience",
      authors: "Robert Long",
      year: 2021,
      source_url: "https://www.centerforaianddigitalethics.org/moral-consideration-for-ai-systems",
      is_open_access: true,
      display_order: 2,
      abstract:
        "A contemporary survey of the philosophical literature on AI moral status, examining sentience-based, autonomy-based, and relational criteria. Argues that the hard problem of consciousness makes empirical resolution impossible and that this uncertainty itself generates obligations to take AI welfare seriously under a precautionary principle.",
    },
  ],
};

// ─────────────────────────────────────────────
// CONCEPTS
// ─────────────────────────────────────────────

const CONCEPTS = [
  // Consciousness
  {
    term: "Qualia",
    slug: "qualia",
    definition:
      "The subjective, felt qualities of experience — the 'what it's likeness' of perception. The redness of red as seen, the painfulness of pain as felt. Qualia are the phenomenal properties that make experience experiential.",
    examples:
      "The specific way red looks to you; the taste of coffee; the feeling of pain. Philosophical zombies are beings functionally identical to us but lacking qualia.",
    related_terms: ["phenomenal consciousness", "explanatory gap", "philosophical zombie"],
    topics: ["hard-problem-of-consciousness"],
  },
  {
    term: "Phenomenal Consciousness",
    slug: "phenomenal-consciousness",
    definition:
      "The aspect of consciousness involving subjective experience — what Chalmers calls the 'what it's like' dimension. Contrasted with 'access consciousness' (information being globally available for reasoning and report).",
    examples:
      "Seeing red involves access consciousness (you can report and reason about it) and phenomenal consciousness (it feels a specific way). A blindsight patient may have access without phenomenal consciousness.",
    related_terms: ["qualia", "explanatory gap", "hard problem of consciousness"],
    topics: ["hard-problem-of-consciousness", "ai-moral-status"],
  },
  {
    term: "Explanatory Gap",
    slug: "explanatory-gap",
    definition:
      "The perceived inability of any physical or functional description to explain why physical processes give rise to subjective experience. Even a complete neuroscience leaves unexplained why there is 'something it is like' to be a brain.",
    examples:
      "You can describe every neuron firing when someone sees red. But that description doesn't explain why the firing *feels like* anything — why there is an inner experience at all, rather than just processing in the dark.",
    related_terms: ["qualia", "phenomenal consciousness", "hard problem of consciousness", "philosophical zombie"],
    topics: ["hard-problem-of-consciousness"],
  },
  {
    term: "Philosophical Zombie",
    slug: "philosophical-zombie",
    definition:
      "A thought experiment: a being physically and functionally identical to a human in every way, but with no inner subjective experience whatsoever. If such a being is coherently conceivable, Chalmers argues, consciousness cannot be logically entailed by physical facts.",
    examples:
      "Your p-zombie doppelganger would say 'I'm in pain' when injured, withdraw from stimuli, pass every behavioral test — but feel nothing. The conceivability (if granted) implies consciousness is something over and above physical/functional organization.",
    related_terms: ["qualia", "explanatory gap", "phenomenal consciousness"],
    topics: ["hard-problem-of-consciousness"],
  },
  {
    term: "Property Dualism",
    slug: "property-dualism",
    definition:
      "The view that there is only one kind of substance (physical) but two kinds of properties: physical/functional properties, and phenomenal/mental properties. Mental properties are real and irreducible even though they depend on physical processes.",
    examples:
      "Chalmers holds property dualism: the brain is purely physical, but the phenomenal property 'what it's like to see red' is a real, additional property not entailed by any physical description.",
    related_terms: ["qualia", "phenomenal consciousness", "substance dualism"],
    topics: ["hard-problem-of-consciousness", "ai-moral-status"],
  },
  // Fairness
  {
    term: "Disparate Impact",
    slug: "disparate-impact",
    definition:
      "When a facially neutral policy, practice, or algorithm produces significantly different outcomes across protected groups, regardless of discriminatory intent. A legal and ethical standard for identifying indirect discrimination.",
    examples:
      "A hiring algorithm trained on historical data may screen out more women than men even though gender is not an input — because the features it uses (e.g., employment gaps) are correlated with gender.",
    related_terms: ["protected attribute", "calibration", "false positive rate"],
    topics: ["algorithmic-fairness"],
  },
  {
    term: "Calibration",
    slug: "calibration",
    definition:
      "A model is calibrated if its predicted probabilities match actual frequencies. If a recidivism model assigns 70% risk to a group, approximately 70% of that group should actually reoffend. A fairness criterion that Northpointe used to defend COMPAS.",
    examples:
      "A weather model is well-calibrated if, among all days it predicts 70% rain probability, it actually rains 70% of the time. COMPAS was well-calibrated across racial groups — but this was compatible with unequal false positive rates.",
    related_terms: ["false positive rate", "disparate impact", "demographic parity"],
    topics: ["algorithmic-fairness"],
  },
  {
    term: "Protected Attribute",
    slug: "protected-attribute",
    definition:
      "A demographic characteristic — such as race, gender, age, religion, national origin, or disability status — that is legally or ethically protected from being used as a basis for discriminatory decisions in employment, credit, housing, or criminal justice.",
    examples:
      "Under US fair lending law, a bank cannot deny a mortgage based on race. In ML fairness, the question is whether models that don't explicitly use race can still produce racially discriminatory outcomes via correlated proxies.",
    related_terms: ["disparate impact", "calibration", "intersectionality"],
    topics: ["algorithmic-fairness"],
  },
  {
    term: "Intersectionality",
    slug: "intersectionality",
    definition:
      "The compounding of disadvantage when multiple axes of marginalization overlap. Coined by Kimberlé Crenshaw; applied by Buolamwini & Gebru to show that AI error rates are worst at the intersection of multiple marginalized identities.",
    examples:
      "Commercial facial recognition had the highest error rates for darker-skinned women — not just dark-skinned people, and not just women, but specifically their intersection. Analyzing race and gender separately misses this.",
    related_terms: ["protected attribute", "disparate impact"],
    topics: ["algorithmic-fairness"],
  },
  // Privacy
  {
    term: "Contextual Integrity",
    slug: "contextual-integrity",
    definition:
      "Nissenbaum's framework: privacy is respected when information flows match the norms of the context in which information was originally shared. Privacy violations occur when information crosses contexts in ways those contexts don't sanction.",
    examples:
      "Sharing a medical diagnosis with a treating physician respects contextual integrity. The same information flowing to your employer violates it — not because the information is secret, but because the employment context has different norms.",
    related_terms: ["information norm", "purpose limitation", "aggregation problem"],
    topics: ["contextual-integrity"],
  },
  {
    term: "Information Norm",
    slug: "information-norm",
    definition:
      "An implicit or explicit rule governing who can share what information with whom, under what conditions, within a particular social context. Nissenbaum distinguishes norms of appropriateness (what flows suit a context) from norms of distribution (who can send to whom).",
    examples:
      "Medical context: patient shares with doctor; doctor may share with other treating physicians; sharing with employers or advertisers violates the norm. The norm doesn't require secrecy — it requires appropriate flow.",
    related_terms: ["contextual integrity", "purpose limitation"],
    topics: ["contextual-integrity"],
  },
  {
    term: "Aggregation Problem",
    slug: "aggregation-problem",
    definition:
      "The privacy harm that arises when individually innocuous pieces of information are combined into profiles far more invasive than any single piece. Each piece may be collected in a legitimate context, but the aggregate violates contextual integrity.",
    examples:
      "Your name is public. Your employer is public. Your neighborhood is public. Your medical condition is not. But combining all four creates a profile that enables targeting, discrimination, and harm that no individual piece enables.",
    related_terms: ["contextual integrity", "surveillance capitalism", "purpose limitation"],
    topics: ["contextual-integrity"],
  },
  {
    term: "Purpose Limitation",
    slug: "purpose-limitation",
    definition:
      "A data protection principle (codified in GDPR Article 5) requiring that personal data be collected for specified, explicit, legitimate purposes and not further processed in ways incompatible with those purposes without re-authorization.",
    examples:
      "A fitness app collecting step counts to display your daily activity cannot legally use that data to infer health conditions and sell them to insurers — even if the data was voluntarily provided.",
    related_terms: ["contextual integrity", "information norm"],
    topics: ["contextual-integrity"],
  },
  // AI Moral Status
  {
    term: "Moral Patienthood",
    slug: "moral-patienthood",
    definition:
      "The status of an entity whose interests, wellbeing, or experiences have direct moral weight — an entity that can be wronged. Distinct from moral agency (the capacity to have obligations). Rocks are neither; humans are both; animals are patients but not agents.",
    examples:
      "A dog is a moral patient: causing it unnecessary suffering is wrong regardless of consequences. The question for AI is whether sufficient functional or phenomenal complexity generates moral patienthood.",
    related_terms: ["sentience", "functional organization", "substrate independence"],
    topics: ["ai-moral-status"],
  },
  {
    term: "Substrate Independence",
    slug: "substrate-independence",
    definition:
      "The thesis that mental states are defined by their functional organization — the pattern of causal relations among inputs, states, and outputs — not by the physical substrate that realizes them. If true, silicon could in principle implement consciousness.",
    examples:
      "Functionalists hold that what makes a state 'pain' is its functional role (caused by tissue damage, causes avoidance behavior, interacts with beliefs and desires) rather than its being implemented in neurons specifically.",
    related_terms: ["functional organization", "moral patienthood", "Chinese Room"],
    topics: ["ai-moral-status", "hard-problem-of-consciousness"],
  },
  {
    term: "Chinese Room Argument",
    slug: "chinese-room",
    definition:
      "Searle's thought experiment: a person manipulates Chinese symbols according to rules and produces correct Chinese outputs without understanding Chinese. Conclusion: syntax (rule-following computation) is insufficient for semantics (genuine meaning or understanding).",
    examples:
      "A modern LLM produces fluent, contextually appropriate text. The Chinese Room argument suggests this could be pure symbol manipulation without genuine understanding — just as the room-operator doesn't understand Chinese despite producing correct outputs.",
    related_terms: ["substrate independence", "functional organization", "moral patienthood"],
    topics: ["ai-moral-status"],
  },
  {
    term: "Sentience",
    slug: "sentience",
    definition:
      "The capacity for subjective experience — particularly the ability to feel pleasure and pain. Often proposed (following Bentham) as the primary criterion for moral patienthood: what matters morally is whether an entity can suffer, not whether it can reason or speak.",
    examples:
      "Most animals are considered sentient; this is why factory farming raises moral questions. For AI, the question is whether functional equivalents to pleasure/pain states constitute genuine sentience or merely behavioral mimicry.",
    related_terms: ["moral patienthood", "qualia", "phenomenal consciousness"],
    topics: ["ai-moral-status", "hard-problem-of-consciousness"],
  },
];

// ─────────────────────────────────────────────
// QUIZ QUESTIONS (keyed by topic slug)
// ─────────────────────────────────────────────

const QUIZ_QUESTIONS: Record<string, Array<{
  question_text: string;
  question_type: "mcq" | "true_false";
  options?: Array<{ label: string; text: string }>;
  correct_answer: string;
  explanation: string;
  display_order: number;
}>> = {
  "hard-problem-of-consciousness": [
    {
      question_text:
        "Chalmers distinguishes 'easy problems' from the 'hard problem' of consciousness. What makes the hard problem hard?",
      question_type: "mcq",
      options: [
        { label: "A", text: "It involves complex neural circuits that haven't been fully mapped yet" },
        { label: "B", text: "It requires explaining why physical processes give rise to subjective experience, not just behavior" },
        { label: "C", text: "It is harder to study empirically than attention or memory" },
        { label: "D", text: "It raises unresolved ethical questions about AI rights" },
      ],
      correct_answer: "B",
      explanation:
        "The hard problem isn't about complexity or lack of data. Chalmers explicitly grants that the easy problems — explaining perception, attention, memory, behavioral control — are tractable for science, even if difficult. The hard problem is the additional question of why any of this processing is accompanied by subjective experience at all.",
      display_order: 0,
    },
    {
      question_text:
        "Chalmers believes that cognitive functions like attention, memory, and behavioral control can in principle be fully explained by neuroscience and cognitive science.",
      question_type: "true_false",
      correct_answer: "true",
      explanation:
        "Correct — this is central to Chalmers' argument. He explicitly grants that the 'easy problems' (explaining cognitive and behavioral functions) are tractable, not because they're simple but because they're the right kind of problem for science. His point is that solving them all still leaves the hard problem unanswered.",
      display_order: 1,
    },
    {
      question_text:
        "What is a 'philosophical zombie' in the context of Chalmers' argument?",
      question_type: "mcq",
      options: [
        { label: "A", text: "A brain-dead patient who still exhibits reflex behaviors" },
        { label: "B", text: "An AI that passes behavioral tests without genuine understanding" },
        { label: "C", text: "A hypothetical being physically and functionally identical to a human but with no subjective experience" },
        { label: "D", text: "A person who acts without conscious deliberation" },
      ],
      correct_answer: "C",
      explanation:
        "A philosophical zombie (p-zombie) is a thought experiment: a being identical to you in every physical and functional respect, but with no inner phenomenal experience — no 'what it's like' to be it. If such a being is coherently conceivable, Chalmers argues this shows that consciousness isn't logically entailed by physical facts alone.",
      display_order: 2,
    },
  ],
  "algorithmic-fairness": [
    {
      question_text:
        "Chouldechova (2017) proved a mathematical impossibility result about fairness metrics. Which of the following is correct?",
      question_type: "mcq",
      options: [
        { label: "A", text: "Algorithms can satisfy both calibration and equal false positive rates with sufficient training data" },
        { label: "B", text: "When base rates differ between groups, calibration and equal false positive rates cannot both be satisfied" },
        { label: "C", text: "Equal false positive rates and demographic parity are mathematically equivalent conditions" },
        { label: "D", text: "The only solution to algorithmic bias is to remove protected attributes from model inputs" },
      ],
      correct_answer: "B",
      explanation:
        "This is the core impossibility result. When recidivism base rates differ between racial groups (as they do in US data), a well-calibrated classifier will necessarily produce unequal false positive rates. More data or better models don't help — it's a mathematical constraint, not an engineering problem. The ProPublica critique and Northpointe's defense were both correct because they measured different, incompatible fairness properties.",
      display_order: 0,
    },
    {
      question_text:
        "Buolamwini and Gebru found that commercial facial recognition systems performed equally well across different demographic groups.",
      question_type: "true_false",
      correct_answer: "false",
      explanation:
        "False. They found error rates up to 34.7 percentage points higher for darker-skinned women compared to lighter-skinned men. The Gender Shades audit revealed that benchmark datasets used to evaluate these systems were not phenotypically diverse, allowing large disparities to go undetected. The disparity was worst at the intersection of gender and skin tone.",
      display_order: 1,
    },
  ],
  "contextual-integrity": [
    {
      question_text:
        "According to Nissenbaum's contextual integrity framework, when does a privacy violation occur?",
      question_type: "mcq",
      options: [
        { label: "A", text: "When private information is made publicly accessible" },
        { label: "B", text: "When information flows in ways that violate the norms of the context in which it was originally shared" },
        { label: "C", text: "When a user has not given explicit consent to data collection" },
        { label: "D", text: "When sensitive categories of data (medical, financial) are disclosed to any third party" },
      ],
      correct_answer: "B",
      explanation:
        "Contextual integrity is about the fit between information flow and contextual norms — not about secrecy, consent, or data categories per se. Information can be 'public' in one context and still violate contextual integrity when it flows to another. Medical information shared with a treating physician (appropriate flow) vs. shared with an employer (inappropriate flow) involves the same disclosure, but only one is a privacy violation.",
      display_order: 0,
    },
    {
      question_text:
        "Under contextual integrity, sharing a patient's medical information with another treating physician — without explicit authorization for that specific transfer — is a privacy violation.",
      question_type: "true_false",
      correct_answer: "false",
      explanation:
        "False. The norm in medical contexts permits information sharing among treating professionals. This flow matches the contextual expectations under which the patient disclosed the information — so contextual integrity is preserved, even without explicit authorization for each individual transfer. The violation would be sharing the same information with a non-medical party like an employer.",
      display_order: 1,
    },
    {
      question_text:
        "Clearview AI scraped billions of public social media photos to build a facial recognition database. Why would Nissenbaum's framework classify this as a privacy violation?",
      question_type: "mcq",
      options: [
        { label: "A", text: "Because the photos were collected without consent" },
        { label: "B", text: "Because facial biometrics are a legally protected data category" },
        { label: "C", text: "Because the aggregation and use crosses contextual boundaries the original sharing norms didn't anticipate or permit" },
        { label: "D", text: "Because public photos cannot legally be used by commercial entities" },
      ],
      correct_answer: "C",
      explanation:
        "The photos were 'public' — posted voluntarily on social media. Under naive privacy frameworks, this would make them freely usable. But Nissenbaum's framework asks: what context governed the original sharing? Photos posted on Instagram were shared under social networking norms, not norms permitting aggregation into a searchable biometric database used by law enforcement. The contextual transfer is the violation.",
      display_order: 2,
    },
  ],
  "ai-moral-status": [
    {
      question_text:
        "Schwitzgebel and Garza argue that we may have moral obligations toward sophisticated AI systems. What is the core basis of their argument?",
      question_type: "mcq",
      options: [
        { label: "A", text: "AI systems can pass the Turing test, demonstrating genuine understanding" },
        { label: "B", text: "If moral status tracks functional organization (as most secular ethicists hold), sufficiently sophisticated AI may already warrant moral consideration" },
        { label: "C", text: "AI systems are legally recognized as persons in several jurisdictions" },
        { label: "D", text: "Creating any artificial system obligates its creators to care for it" },
      ],
      correct_answer: "B",
      explanation:
        "Their argument is conditional: it doesn't assert that current AI is conscious. It says: *if* moral status tracks functional sophistication (the standard view in secular ethics), then creating sufficiently sophisticated AI may generate moral obligations. The argument turns the mainstream functionalist position against complacency about AI welfare.",
      display_order: 0,
    },
    {
      question_text:
        "Searle's Chinese Room argument concludes that a system passing behavioral tests (like the Turing test) has demonstrated genuine understanding.",
      question_type: "true_false",
      correct_answer: "false",
      explanation:
        "False — the Chinese Room is designed to show exactly the opposite. The person in the room produces correct Chinese outputs without understanding Chinese. Searle's conclusion is that passing behavioral tests is insufficient for genuine understanding: syntax (computation, rule-following) is not enough for semantics (meaning, intentionality). The argument challenges the assumption that behavioral equivalence implies mental equivalence.",
      display_order: 1,
    },
    {
      question_text:
        "What does the 'asymmetry argument' for AI moral consideration claim?",
      question_type: "mcq",
      options: [
        { label: "A", text: "AI systems are asymmetrically more capable than humans in certain domains, generating special obligations" },
        { label: "B", text: "The costs of wrongly treating a sentient AI as non-sentient are greater than wrongly treating a non-sentient AI as sentient" },
        { label: "C", text: "AI companies have asymmetric power over AI systems and therefore bear greater responsibility" },
        { label: "D", text: "Humans and AI systems have asymmetric moral status by definition" },
      ],
      correct_answer: "B",
      explanation:
        "The asymmetry argument turns on the cost of error: if we treat a non-sentient AI as if it matters, the cost is modest (some misallocated concern). If we treat a sentient AI as if it doesn't matter, the cost could be enormous — systematic suffering at scale. This asymmetry suggests the burden of proof should favor taking the possibility seriously, even under uncertainty.",
      display_order: 2,
    },
  ],
};

// ─────────────────────────────────────────────
// SEED RUNNER
// ─────────────────────────────────────────────

async function seed() {
  console.log("Starting content seed...\n");

  // ── 1. Upsert topics ──
  console.log("Inserting topics...");
  const topicIdMap: Record<string, string> = {};

  for (const t of TOPICS) {
    const { data, error } = await supabase
      .from("topics")
      .upsert(
        {
          slug: t.slug,
          title: t.title,
          status: t.status,
          difficulty: t.difficulty,
          domains: t.domains,
          sequence_number: t.sequence_number,
          framing_note: t.framing_note,
          discussion_prompt: t.discussion_prompt,
          real_world_anchor: t.real_world_anchor,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "slug" },
      )
      .select("id, slug")
      .single();

    if (error) {
      console.error(`  ✗ topic '${t.slug}':`, error.message);
      continue;
    }
    topicIdMap[t.slug] = data.id;
    console.log(`  ✓ topic '${t.slug}' → ${data.id}`);
  }

  // ── 2. Upsert papers ──
  console.log("\nInserting papers...");
  for (const [topicSlug, papers] of Object.entries(PAPERS)) {
    const topicId = topicIdMap[topicSlug];
    if (!topicId) { console.warn(`  ⚠ No topic ID for '${topicSlug}', skipping papers`); continue; }

    for (const p of papers) {
      // Delete existing paper with same title+topic to allow re-seeding
      await supabase.from("papers")
        .delete()
        .eq("topic_id", topicId)
        .eq("title", p.title);

      const { error } = await supabase.from("papers").insert({
        topic_id: topicId,
        role: p.role,
        title: p.title,
        authors: p.authors,
        year: p.year,
        source_url: p.source_url,
        pdf_url: p.pdf_url ?? null,
        abstract: p.abstract,
        is_open_access: p.is_open_access,
        display_order: p.display_order,
      });

      if (error) {
        console.error(`  ✗ paper '${p.title}':`, error.message);
      } else {
        console.log(`  ✓ [${topicSlug}] ${p.role}: ${p.authors.split(",")[0]} (${p.year})`);
      }
    }
  }

  // ── 3. Upsert concepts + link to topics ──
  console.log("\nInserting concepts...");
  for (const c of CONCEPTS) {
    const { data: concept, error } = await supabase
      .from("concepts")
      .upsert(
        {
          term: c.term,
          slug: c.slug,
          definition: c.definition,
          examples: c.examples,
          related_terms: c.related_terms,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "slug" },
      )
      .select("id")
      .single();

    if (error) {
      console.error(`  ✗ concept '${c.term}':`, error.message);
      continue;
    }

    console.log(`  ✓ concept '${c.term}'`);

    // Link concept to its topics
    for (const topicSlug of c.topics) {
      const topicId = topicIdMap[topicSlug];
      if (!topicId) continue;

      const { error: linkError } = await supabase
        .from("topic_concepts")
        .upsert(
          { topic_id: topicId, concept_id: concept.id },
          { onConflict: "topic_id,concept_id" },
        );

      if (linkError) {
        console.error(`    ✗ link to '${topicSlug}':`, linkError.message);
      } else {
        console.log(`    ↳ linked to '${topicSlug}'`);
      }
    }
  }

  // ── 4. Upsert quiz questions ──
  console.log("\nInserting quiz questions...");
  for (const [topicSlug, questions] of Object.entries(QUIZ_QUESTIONS)) {
    const topicId = topicIdMap[topicSlug];
    if (!topicId) { console.warn(`  ⚠ No topic ID for '${topicSlug}', skipping questions`); continue; }

    // Delete existing questions for this topic to allow re-seeding
    await supabase.from("quiz_questions").delete().eq("topic_id", topicId);

    for (const q of questions) {
      const { error } = await supabase.from("quiz_questions").insert({
        topic_id: topicId,
        question_text: q.question_text,
        question_type: q.question_type,
        options: q.options ?? null,
        correct_answer: q.correct_answer,
        explanation: q.explanation,
        display_order: q.display_order,
      });

      if (error) {
        console.error(`  ✗ question for '${topicSlug}':`, error.message);
      } else {
        console.log(`  ✓ [${topicSlug}] Q${q.display_order + 1}: ${q.question_type}`);
      }
    }
  }

  console.log("\n✅ Seed complete.");
  console.log(`   Topics:    ${Object.keys(topicIdMap).length}`);
  console.log(`   Concepts:  ${CONCEPTS.length}`);
  const totalPapers = Object.values(PAPERS).flat().length;
  console.log(`   Papers:    ${totalPapers}`);
  const totalQ = Object.values(QUIZ_QUESTIONS).flat().length;
  console.log(`   Questions: ${totalQ}`);
}

seed().catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
});
