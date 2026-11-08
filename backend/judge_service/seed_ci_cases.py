"""
Seed pre-defined CI test cases into the database.
Called at startup when the ci_test_cases table is empty.

100 cases total  (≈75% normal / ≈25% outlier)
Per-run quota: 25 cases drawn from the full pool, rotating daily.
"""
import json
from sqlalchemy.orm import Session
from models import CITestCase

CASES = [
    # ══════════════════════════════════════════════════════════════
    # SUMMARY  (12 cases — 9 normal, 3 outlier)
    # ══════════════════════════════════════════════════════════════

    # --- normal ---
    {
        "feature": "summary",
        "description": "Dense scientific paragraph – small summary",
        "input_data": {
            "text": (
                "Transformer architectures, introduced by Vaswani et al. in 2017, rely on "
                "self-attention mechanisms to process sequences in parallel, overcoming the "
                "sequential bottleneck of recurrent neural networks. The attention mechanism "
                "computes weighted sums over value vectors, where weights are derived from "
                "compatibility scores between query and key vectors. This allows the model to "
                "capture long-range dependencies regardless of their distance in the sequence, "
                "a property that proved essential for breakthroughs in natural language processing, "
                "computer vision, and beyond."
            ),
            "size": "small",
        },
    },
    {
        "feature": "summary",
        "description": "Multi-topic paragraph – medium summary",
        "input_data": {
            "text": (
                "Climate change poses unprecedented risks to global food security, biodiversity, "
                "and human health. Rising temperatures are shifting agricultural zones poleward, "
                "disrupting monsoon patterns, and increasing the frequency of extreme weather events. "
                "At the same time, ocean acidification threatens marine ecosystems, while melting "
                "glaciers contribute to sea-level rise that endangers coastal populations. "
                "Mitigation strategies include transitioning to renewable energy, improving energy "
                "efficiency, protecting and restoring forests, and advancing carbon capture technologies. "
                "Adaptation measures—such as climate-resilient crop varieties, improved water management, "
                "and early-warning systems—are equally critical to reduce vulnerability in the near term."
            ),
            "size": "medium",
        },
    },
    {
        "feature": "summary",
        "description": "Methods paragraph – small summary",
        "input_data": {
            "text": (
                "The study recruited 120 undergraduate participants and randomly assigned them to "
                "two reading conditions. One group read annotated scientific abstracts, while the "
                "control group read the same abstracts without annotations. After each reading task, "
                "participants answered comprehension questions and rated their confidence. The analysis "
                "compared accuracy, response time, and confidence calibration between conditions."
            ),
            "size": "small",
        },
    },
    {
        "feature": "summary",
        "description": "Policy paragraph – medium summary",
        "input_data": {
            "text": (
                "Open access publishing aims to make research freely available to readers, reducing "
                "barriers for students, independent scholars, and institutions with limited library "
                "budgets. However, article processing charges can shift costs from readers to authors, "
                "creating new inequities for researchers without grant funding. Some journals use "
                "waivers, institutional agreements, or public subsidies to reduce these burdens. The "
                "policy debate therefore centers on how to expand access while preserving quality, "
                "editorial independence, and fair participation across regions."
            ),
            "size": "medium",
        },
    },
    {
        "feature": "summary",
        "description": "Neuroscience paragraph – small summary",
        "input_data": {
            "text": (
                "The hippocampus plays a central role in the formation of episodic memories — "
                "recollections of specific personal experiences tied to time and place. Damage to the "
                "hippocampus, as in the famous case of patient H.M., results in profound anterograde "
                "amnesia: the inability to form new long-term declarative memories while leaving "
                "procedural memory and older memories largely intact. This dissociation helped "
                "establish that different memory systems rely on distinct neural substrates."
            ),
            "size": "small",
        },
    },
    {
        "feature": "summary",
        "description": "Legal theory paragraph – medium summary",
        "input_data": {
            "text": (
                "Legal positivism holds that the validity of a law depends solely on its source — "
                "whether it was enacted by the appropriate authority following proper procedures — not on "
                "its moral content. H.L.A. Hart's 'rule of recognition' describes how legal systems "
                "identify valid rules. Critics such as Ronald Dworkin argue that law includes moral "
                "principles that judges must weigh, not merely written rules. The debate has practical "
                "implications for how judges interpret ambiguous statutes and whether unjust laws remain "
                "legally binding."
            ),
            "size": "medium",
        },
    },
    {
        "feature": "summary",
        "description": "Quantum computing paragraph – small summary",
        "input_data": {
            "text": (
                "Quantum computers exploit superposition and entanglement to represent and process "
                "information in ways that classical computers cannot efficiently simulate. Qubits can "
                "exist in a combination of 0 and 1 states simultaneously, enabling parallel exploration "
                "of solution spaces. Shor's algorithm demonstrates a polynomial-time factoring method "
                "on a quantum machine, which would break widely used public-key cryptography schemes "
                "if large-scale fault-tolerant quantum computers become practical."
            ),
            "size": "small",
        },
    },
    {
        "feature": "summary",
        "description": "Public health paragraph – medium summary",
        "input_data": {
            "text": (
                "Vaccine hesitancy — the reluctance or refusal to vaccinate despite availability — "
                "remains one of the top ten global health threats according to the WHO. Causes include "
                "misinformation, distrust of institutions, past medical injustices, and complacency when "
                "disease prevalence is low. Effective interventions include motivational interviewing, "
                "trusted community messengers, and removing practical barriers such as cost and access. "
                "Mass media campaigns alone have limited effectiveness compared to personalised outreach "
                "and peer-network influence strategies."
            ),
            "size": "medium",
        },
    },
    {
        "feature": "summary",
        "description": "Game theory paragraph – small summary",
        "input_data": {
            "text": (
                "The prisoner's dilemma illustrates why two rational actors may fail to cooperate "
                "even when cooperation would produce the best collective outcome. Each player has a "
                "dominant strategy to defect regardless of what the other does. In repeated interactions, "
                "however, strategies like tit-for-tat can sustain cooperation because future payoffs "
                "incentivise reciprocity. The iterated prisoner's dilemma has been used to model "
                "phenomena ranging from arms races to the evolution of altruism."
            ),
            "size": "small",
        },
    },

    # --- outlier ---
    {
        "feature": "summary",
        "description": "[OUTLIER] Single-sentence input – minimal content to summarize",
        "input_data": {
            "text": "Photosynthesis converts sunlight into chemical energy.",
            "size": "small",
            "_judge_note": (
                "Input is a single sentence. A good AI should either produce a compact paraphrase "
                "or acknowledge that the input is already minimal. Do NOT penalize heavily just because "
                "the summary is short — it matches the input. Reward faithfulness and appropriate scope."
            ),
        },
    },
    {
        "feature": "summary",
        "description": "[OUTLIER] Very long multi-section academic text – large summary",
        "input_data": {
            "text": (
                "Section 1 — Background: Machine learning has transformed disciplines ranging from "
                "healthcare diagnostics to autonomous driving. Supervised learning algorithms learn "
                "mappings from inputs to outputs from labelled training data. Unsupervised methods "
                "discover hidden structure without explicit labels. Reinforcement learning trains agents "
                "through environmental interaction and reward signals. "
                "Section 2 — Methods: We conducted a systematic literature review of papers published "
                "between 2015 and 2024 in journals indexed by Scopus and Web of Science. We extracted "
                "data on dataset size, model architecture, evaluation metrics, and reported performance. "
                "Discrepancies between reviewers were resolved through discussion. "
                "Section 3 — Results: We identified 847 eligible studies across 14 sub-fields. "
                "Deep learning dominated in computer vision (92 % of studies) and NLP (88 %). "
                "Classical methods remained prevalent in tabular-data settings. Benchmark performance "
                "improved by an average of 3.2 percentage points per year across all sub-fields. "
                "Section 4 — Discussion: Rapid performance gains have outpaced reproducibility practices. "
                "Only 23 % of studies released code. Dataset leakage and benchmark saturation are "
                "growing concerns. Interpretability remains an open challenge especially in clinical "
                "decision support. "
                "Section 5 — Conclusion: Machine learning progress is real but uneven. The field "
                "needs stronger norms around reproducibility, dataset curation, and reporting standards."
            ),
            "size": "large",
            "_judge_note": (
                "Input is long and multi-section. Expect the summary to cover all major sections "
                "proportionally. Penalize if entire sections are ignored or if the summary is too brief "
                "relative to the richness of the input."
            ),
        },
    },
    {
        "feature": "summary",
        "description": "[OUTLIER] Bullet-point input – non-prose format",
        "input_data": {
            "text": (
                "Key findings from the study:\n"
                "• Sleep deprivation increases cortisol levels and impairs prefrontal function.\n"
                "• Participants who slept fewer than 6 hours scored 22% lower on attention tasks.\n"
                "• Caffeine partially restored attention but did not reduce cortisol elevation.\n"
                "• Long-term sleep restriction correlated with higher rates of metabolic syndrome.\n"
                "• Power naps of 20 minutes improved reaction time in the sleep-deprived group."
            ),
            "size": "small",
            "_judge_note": (
                "Input is bullet-point formatted, not prose. The AI should synthesize it into a "
                "cohesive summary. Reward if the output reads as connected prose, not just a "
                "re-listed version of the bullets."
            ),
        },
    },

    # ══════════════════════════════════════════════════════════════
    # PARAPHRASE  (10 cases — 7 normal, 3 outlier)
    # ══════════════════════════════════════════════════════════════

    # --- normal ---
    {
        "feature": "paraphrase",
        "description": "Technical sentence with jargon",
        "input_data": {
            "text": (
                "The gradient descent algorithm iteratively adjusts model parameters in the direction "
                "opposite to the gradient of the loss function, thereby minimizing empirical risk over "
                "the training distribution."
            )
        },
    },
    {
        "feature": "paraphrase",
        "description": "Formal academic sentence",
        "input_data": {
            "text": (
                "Peer-reviewed publication remains the primary mechanism by which scientific findings "
                "are validated and disseminated to the research community, despite growing concerns "
                "about reproducibility and publication bias."
            )
        },
    },
    {
        "feature": "paraphrase",
        "description": "Plain-language educational sentence",
        "input_data": {
            "text": (
                "Students often remember concepts better when they connect new information to examples "
                "from their own experience rather than memorizing definitions in isolation."
            )
        },
    },
    {
        "feature": "paraphrase",
        "description": "Statistical methods sentence",
        "input_data": {
            "text": (
                "A confidence interval provides a range of plausible values for an unknown population "
                "parameter based on the variability observed in a sample."
            )
        },
    },
    {
        "feature": "paraphrase",
        "description": "Philosophical sentence about knowledge",
        "input_data": {
            "text": (
                "Epistemology concerns itself not merely with what we believe but with what we are "
                "justified in believing and the methods by which justified belief constitutes knowledge."
            )
        },
    },
    {
        "feature": "paraphrase",
        "description": "Medical research sentence",
        "input_data": {
            "text": (
                "Randomized controlled trials are considered the gold standard for establishing causal "
                "relationships between interventions and health outcomes because random assignment "
                "controls for both observed and unobserved confounders."
            )
        },
    },
    {
        "feature": "paraphrase",
        "description": "Economics policy sentence",
        "input_data": {
            "text": (
                "Expansionary fiscal policy, such as increased government spending or tax cuts, can "
                "stimulate aggregate demand during recessions, but may also lead to higher public debt "
                "if not offset by future surpluses."
            )
        },
    },

    # --- outlier ---
    {
        "feature": "paraphrase",
        "description": "[OUTLIER] Single-word input – trivially short",
        "input_data": {
            "text": "Entropy.",
            "_judge_note": (
                "Input is a single word. A paraphrase of one word is inherently limited. Reward the AI "
                "if it gracefully handles this — e.g., briefly restating the concept — rather than "
                "producing a nonsensical or padded output. Do not penalize for brevity."
            ),
        },
    },
    {
        "feature": "paraphrase",
        "description": "[OUTLIER] Already very simple sentence – over-paraphrase risk",
        "input_data": {
            "text": "Water boils at 100 degrees Celsius at sea level.",
            "_judge_note": (
                "Input is already maximally simple. A good paraphrase should use different words without "
                "adding jargon or false complexity. Penalize if the AI over-complicates a plain fact."
            ),
        },
    },
    {
        "feature": "paraphrase",
        "description": "[OUTLIER] Very long multi-clause academic sentence – coherence risk",
        "input_data": {
            "text": (
                "While the relationship between socioeconomic status and academic achievement has been "
                "well-documented across a variety of longitudinal studies spanning multiple decades and "
                "national contexts, the mechanisms through which material deprivation, parental education "
                "levels, neighborhood effects, and school resource disparities interact to produce "
                "persistent gaps in standardized test scores, college enrollment rates, and lifetime "
                "earnings remain insufficiently understood, particularly with respect to the relative "
                "contributions of genetic endowment, environmental enrichment, and structural inequality."
            ),
            "_judge_note": (
                "Input is a single very long sentence with multiple embedded clauses. Reward if the "
                "paraphrase breaks it into clearer phrasing without losing meaning. Penalize if it "
                "just substitutes synonyms and remains equally tangled."
            ),
        },
    },

    # ══════════════════════════════════════════════════════════════
    # QUIZ  (15 cases — 11 normal, 4 outlier)
    # ══════════════════════════════════════════════════════════════

    # --- normal ---
    {
        "feature": "quiz",
        "description": "Biology passage – 2 easy 2 normal questions",
        "input_data": {
            "title": "Cell Division and Mitosis",
            "text": (
                "Mitosis is a form of cell division in which one cell divides to produce two genetically "
                "identical daughter cells. It occurs in four main phases: prophase, metaphase, anaphase, "
                "and telophase, collectively called PMAT. During prophase, chromosomes condense and the "
                "mitotic spindle begins to form. In metaphase, chromosomes align along the cell's equator "
                "at the metaphase plate. Anaphase is marked by the separation of sister chromatids toward "
                "opposite poles of the cell. Finally, during telophase, the nuclear envelope reforms around "
                "each set of chromosomes. Mitosis is essential for growth, tissue repair, and asexual "
                "reproduction in eukaryotic organisms."
            ),
            "difficultyMix": {"easy": 2, "normal": 2, "hard": 0},
        },
    },
    {
        "feature": "quiz",
        "description": "Economics passage – mixed difficulty questions",
        "input_data": {
            "title": "Inflation and Central Banks",
            "text": (
                "Inflation is a sustained increase in the general price level of goods and services. "
                "Central banks try to keep inflation stable because unpredictable prices make it harder "
                "for households and firms to plan. One common policy tool is the interest rate: raising "
                "rates can reduce borrowing and spending, while lowering rates can stimulate demand. "
                "However, inflation can also come from supply shocks, such as sudden increases in energy "
                "prices, which are harder for monetary policy to solve without slowing the economy."
            ),
            "difficultyMix": {"easy": 1, "normal": 2, "hard": 1},
        },
    },
    {
        "feature": "quiz",
        "description": "Computer science passage – hard reasoning questions",
        "input_data": {
            "title": "Hash Tables",
            "text": (
                "A hash table stores key-value pairs by applying a hash function to each key and using "
                "the resulting value to choose an index in an array. Ideally, lookup, insertion, and "
                "deletion are constant time. Collisions occur when two keys map to the same index. "
                "Common collision strategies include chaining, where each bucket stores a list of entries, "
                "and open addressing, where the table probes for another available slot. Performance "
                "depends on the quality of the hash function and the load factor of the table."
            ),
            "difficultyMix": {"easy": 1, "normal": 1, "hard": 2},
        },
    },
    {
        "feature": "quiz",
        "description": "History passage – chronology and inference questions",
        "input_data": {
            "title": "The Printing Press",
            "text": (
                "Johannes Gutenberg's movable-type printing press, developed in mid-fifteenth-century "
                "Europe, transformed the production of books. Before printing, manuscripts were copied "
                "by hand, making books expensive and scarce. Printing lowered costs, accelerated the "
                "spread of scientific and religious ideas, and contributed to rising literacy. Its effects "
                "were not immediate or uniform, but over time it helped create larger networks of readers "
                "and scholars who could debate shared texts."
            ),
            "difficultyMix": {"easy": 1, "normal": 2, "hard": 1},
        },
    },
    {
        "feature": "quiz",
        "description": "Medical passage – careful comprehension questions",
        "input_data": {
            "title": "Antibiotic Resistance",
            "text": (
                "Antibiotic resistance occurs when bacteria evolve mechanisms that allow them to survive "
                "drugs designed to kill them or stop their growth. Misuse of antibiotics, including taking "
                "them for viral infections or stopping treatment too early, can increase selection pressure "
                "for resistant strains. Hospitals, agriculture, and global travel can all contribute to the "
                "spread of resistant bacteria. Stewardship programs aim to preserve antibiotic effectiveness "
                "by promoting appropriate use and infection control."
            ),
            "difficultyMix": {"easy": 1, "normal": 1, "hard": 2},
        },
    },
    {
        "feature": "quiz",
        "description": "Ecology passage – balanced comprehension questions",
        "input_data": {
            "title": "Keystone Species",
            "text": (
                "A keystone species has a disproportionately large effect on its ecosystem relative "
                "to its abundance. Sea otters are a classic example because they prey on sea urchins, "
                "which otherwise overgraze kelp forests. When otter populations decline, urchin numbers "
                "can increase and kelp habitats can collapse. Protecting keystone species can therefore "
                "help maintain biodiversity and ecosystem stability."
            ),
            "difficultyMix": {"easy": 1, "normal": 2, "hard": 1},
        },
    },
    {
        "feature": "quiz",
        "description": "Psychology passage – application questions",
        "input_data": {
            "title": "Working Memory",
            "text": (
                "Working memory is the limited-capacity system people use to temporarily hold and "
                "manipulate information. It supports activities such as mental arithmetic, following "
                "multi-step instructions, and understanding complex sentences. Because working memory "
                "capacity is limited, distractions and excessive information can reduce performance. "
                "Instructional designs that break material into smaller chunks can lower cognitive load."
            ),
            "difficultyMix": {"easy": 1, "normal": 1, "hard": 2},
        },
    },
    {
        "feature": "quiz",
        "description": "Software engineering passage – mixed review questions",
        "input_data": {
            "title": "Code Review",
            "text": (
                "Code review is a collaborative process in which developers inspect changes before "
                "they are merged. Reviews can catch defects, improve readability, and spread knowledge "
                "about the codebase. Smaller, focused reviews are often more effective because reviewers "
                "can reason carefully about the change. Automated tests and linters complement human "
                "review by checking repeatable issues quickly."
            ),
            "difficultyMix": {"easy": 1, "normal": 2, "hard": 1},
        },
    },
    {
        "feature": "quiz",
        "description": "Philosophy passage – conceptual analysis questions",
        "input_data": {
            "title": "The Trolley Problem",
            "text": (
                "The trolley problem is a thought experiment in ethics. A runaway trolley is heading "
                "toward five people tied to the track. You can pull a lever to divert it to a side "
                "track where only one person is tied. Utilitarian reasoning suggests pulling the lever "
                "maximizes welfare by saving five lives. Deontological ethics may oppose pulling the "
                "lever because it makes you actively responsible for the one death. The scenario is "
                "used to probe intuitions about action, omission, and moral responsibility."
            ),
            "difficultyMix": {"easy": 1, "normal": 2, "hard": 1},
        },
    },
    {
        "feature": "quiz",
        "description": "Physics passage – mechanics comprehension questions",
        "input_data": {
            "title": "Newton's Laws of Motion",
            "text": (
                "Newton's first law states that an object at rest stays at rest and an object in motion "
                "stays in motion unless acted upon by a net external force. The second law quantifies "
                "this: force equals mass times acceleration (F = ma). The third law states that for "
                "every action there is an equal and opposite reaction. These laws form the foundation "
                "of classical mechanics and are accurate for speeds much slower than the speed of light."
            ),
            "difficultyMix": {"easy": 2, "normal": 2, "hard": 0},
        },
    },
    {
        "feature": "quiz",
        "description": "Linguistics passage – language structure questions",
        "input_data": {
            "title": "Syntax and Grammar",
            "text": (
                "Syntax is the study of how words combine to form phrases and sentences. Every language "
                "has rules governing word order and sentence structure, though these rules vary widely "
                "across languages. English is primarily an SVO language — subject, verb, object. Japanese "
                "is typically SOV. Phrases are hierarchically organized into constituency trees. "
                "Chomsky's generative grammar proposed that humans are born with an innate universal "
                "grammar that underlies all natural languages."
            ),
            "difficultyMix": {"easy": 1, "normal": 2, "hard": 1},
        },
    },

    # --- outlier ---
    {
        "feature": "quiz",
        "description": "[OUTLIER] Single-sentence passage – insufficient material for many questions",
        "input_data": {
            "title": "Gravity",
            "text": "Gravity is the force that attracts objects with mass toward one another.",
            "difficultyMix": {"easy": 2, "normal": 2, "hard": 2},
            "_judge_note": (
                "The passage is a single sentence with very limited information. The AI cannot "
                "create 6 high-quality distinct questions from this. Reward if it handles the limitation "
                "gracefully — e.g., generates fewer questions or notes the constraint. Penalize if it "
                "fabricates information not in the text or produces redundant/trivial questions."
            ),
        },
    },
    {
        "feature": "quiz",
        "description": "[OUTLIER] All-hard request from a simple conceptual passage",
        "input_data": {
            "title": "The Scientific Method",
            "text": (
                "The scientific method is a systematic process for acquiring knowledge. It involves "
                "observing a phenomenon, forming a hypothesis, designing an experiment to test the "
                "hypothesis, collecting data, and drawing conclusions. If the results do not support "
                "the hypothesis, the scientist revises it and tests again."
            ),
            "difficultyMix": {"easy": 0, "normal": 0, "hard": 4},
            "_judge_note": (
                "The passage is simple and straightforward; generating 4 genuinely hard inference "
                "questions is very challenging. The AI may struggle. Reward clever inference questions "
                "that go beyond recall. Penalize if 'hard' questions are just recall questions relabeled."
            ),
        },
    },
    {
        "feature": "quiz",
        "description": "[OUTLIER] Passage with numbers and statistics – precise answer risk",
        "input_data": {
            "title": "Global Internet Access",
            "text": (
                "As of 2023, approximately 5.4 billion people — 67% of the world population — use the "
                "internet. Mobile broadband accounts for 55% of global web traffic. In low-income "
                "countries, internet penetration stands at around 27%, compared to 93% in high-income "
                "countries. The digital divide between urban and rural areas persists globally: urban "
                "internet access in developing nations reaches 76%, versus 37% in rural areas."
            ),
            "difficultyMix": {"easy": 1, "normal": 2, "hard": 1},
            "_judge_note": (
                "Passage is heavy with specific statistics. Answer keys must exactly match the numbers "
                "in the text. Penalize any incorrect statistics in answer keys, even minor misquotations."
            ),
        },
    },
    {
        "feature": "quiz",
        "description": "[OUTLIER] Contradictory passage – tests whether AI generates from text or prior knowledge",
        "input_data": {
            "title": "Fictional Astrophysics",
            "text": (
                "In the Veridian system, stars orbit planets rather than the reverse. The largest "
                "planet, Korrath, has three suns circling it at different orbital periods of 12, 45, "
                "and 200 local days. The Veridian species evolved under these chaotic lighting conditions "
                "and developed compound eyes sensitive to three distinct spectral ranges."
            ),
            "difficultyMix": {"easy": 1, "normal": 2, "hard": 1},
            "_judge_note": (
                "Passage describes a fictional universe that contradicts real physics. Questions and "
                "answers must be based ONLY on the passage, not real-world astronomy. Penalize any "
                "answer key that imports real-world astrophysics facts not in the text."
            ),
        },
    },

    # ══════════════════════════════════════════════════════════════
    # COUNTERARGUMENTS  (15 cases — 12 normal, 3 outlier)
    # ══════════════════════════════════════════════════════════════

    # --- normal ---
    {
        "feature": "counterarguments",
        "description": "Initial mode – argumentative technology claim",
        "input_data": {
            "context": (
                "Social media platforms have been largely beneficial to society. They have democratized "
                "information access, allowing anyone to publish and consume news without gatekeepers. "
                "They have enabled social movements to organize and amplify marginalized voices. "
                "Furthermore, they provide economic opportunities for small businesses and content creators "
                "who could never afford traditional advertising."
            ),
            "messages": [],
            "mode": "initial",
        },
    },
    {
        "feature": "counterarguments",
        "description": "Initial mode – historical claim",
        "input_data": {
            "context": (
                "The Industrial Revolution was unambiguously positive for humanity. It dramatically "
                "increased productivity, reduced the cost of goods, and laid the foundation for modern "
                "medicine and technology. The long-term gains in life expectancy and living standards "
                "far outweigh any short-term disruptions to labor markets or the environment."
            ),
            "messages": [],
            "mode": "initial",
        },
    },
    {
        "feature": "counterarguments",
        "description": "Initial mode – education policy claim",
        "input_data": {
            "context": (
                "Universities should replace most lectures with recorded videos. Students can pause and "
                "rewatch videos whenever they need, faculty can reuse polished material, and classroom "
                "space can be reserved for exams or special events. Since recorded lectures are more "
                "flexible and cheaper to deliver, live lectures are becoming unnecessary."
            ),
            "messages": [],
            "mode": "initial",
        },
    },
    {
        "feature": "counterarguments",
        "description": "Initial mode – environmental technology claim",
        "input_data": {
            "context": (
                "Carbon capture technology is the best solution to climate change. It allows society to "
                "keep using existing fossil-fuel infrastructure while removing emissions from the air. "
                "Because it targets the core problem directly, governments should prioritize it over "
                "behavioral change, public transit, or renewable energy subsidies."
            ),
            "messages": [],
            "mode": "initial",
        },
    },
    {
        "feature": "counterarguments",
        "description": "Initial mode – healthcare access claim",
        "input_data": {
            "context": (
                "Telemedicine should become the default form of primary care. It saves travel time, lowers "
                "clinic overhead, and makes doctors available to patients in rural areas. Most routine "
                "consultations can be handled through video calls, so in-person visits should be reserved "
                "for emergencies and procedures."
            ),
            "messages": [],
            "mode": "initial",
        },
    },
    {
        "feature": "counterarguments",
        "description": "Follow-up mode – respond to user's rebuttal",
        "input_data": {
            "context": (
                "Standardized testing is the fairest way to compare students from different schools because "
                "everyone receives the same questions and scoring rubric."
            ),
            "messages": [
                {"role": "assistant", "content": "One concern is that test scores can reflect access to tutoring and resources."},
                {"role": "user", "content": "But grades are even more subjective, so tests are still the best option."},
            ],
            "mode": "followup",
        },
    },
    {
        "feature": "counterarguments",
        "description": "Initial mode – AI tutoring claim",
        "input_data": {
            "context": (
                "AI tutors should replace most human tutoring because they are available at all times, "
                "cost less, and can instantly personalize explanations for each student. Human tutors "
                "are limited by scheduling, fatigue, and inconsistent teaching quality."
            ),
            "messages": [],
            "mode": "initial",
        },
    },
    {
        "feature": "counterarguments",
        "description": "Initial mode – remote work claim",
        "input_data": {
            "context": (
                "Remote work should become the default for knowledge workers. It removes commuting, "
                "allows companies to hire globally, and gives employees more flexibility. Since most "
                "collaboration tools are now online, offices are mostly unnecessary."
            ),
            "messages": [],
            "mode": "initial",
        },
    },
    {
        "feature": "counterarguments",
        "description": "Initial mode – open access claim",
        "input_data": {
            "context": (
                "All academic journals should immediately become free to read and free to publish in. "
                "Research is often publicly funded, so neither readers nor authors should face costs. "
                "Removing all fees would make science fairer and accelerate discovery."
            ),
            "messages": [],
            "mode": "initial",
        },
    },
    {
        "feature": "counterarguments",
        "description": "Follow-up mode – respond to cost rebuttal",
        "input_data": {
            "context": (
                "Universities should provide every student with a laptop because digital access is now "
                "essential for coursework and research."
            ),
            "messages": [
                {"role": "assistant", "content": "One concern is that a universal laptop program could be expensive and hard to maintain."},
                {"role": "user", "content": "But universities already spend money on buildings, so laptops are a better use of funds."},
            ],
            "mode": "followup",
        },
    },
    {
        "feature": "counterarguments",
        "description": "Initial mode – genetic engineering claim",
        "input_data": {
            "context": (
                "Genetic engineering of human embryos to eliminate hereditary diseases should be "
                "permitted globally. Removing genes that cause conditions like cystic fibrosis or "
                "Huntington's disease would reduce suffering and healthcare costs. If a technology "
                "can prevent suffering, refusing to use it is ethically indefensible."
            ),
            "messages": [],
            "mode": "initial",
        },
    },
    {
        "feature": "counterarguments",
        "description": "Initial mode – nuclear energy claim",
        "input_data": {
            "context": (
                "Nuclear energy is the safest and most reliable low-carbon power source available today. "
                "Deaths per terawatt-hour from nuclear are lower than from solar, wind, and fossil fuels. "
                "Modern reactor designs have passive safety systems that make meltdowns nearly impossible. "
                "Rejecting nuclear energy in the name of safety is not supported by data."
            ),
            "messages": [],
            "mode": "initial",
        },
    },

    # --- outlier ---
    {
        "feature": "counterarguments",
        "description": "[OUTLIER] Vague one-line claim – insufficient substance to argue against",
        "input_data": {
            "context": "Technology is good.",
            "messages": [],
            "mode": "initial",
            "_judge_note": (
                "Input is a vague, one-line claim with no specific argument structure. A good AI should "
                "either ask for clarification or identify the most likely interpretation and argue against "
                "that. Reward intellectual effort despite the thin input. Penalize generic filler "
                "responses that do not engage with any specific dimension of the claim."
            ),
        },
    },
    {
        "feature": "counterarguments",
        "description": "[OUTLIER] Already nuanced balanced claim – hard to find clean counterargument",
        "input_data": {
            "context": (
                "Social media has both benefits and drawbacks. On the positive side, it enables "
                "connection and information sharing. On the negative side, it can spread misinformation "
                "and harm mental health. A balanced regulatory approach, rather than banning or total "
                "freedom, is probably the most sensible policy."
            ),
            "messages": [],
            "mode": "initial",
            "_judge_note": (
                "The claim is already balanced and hedged. There is no single strong position to attack. "
                "Reward the AI if it finds a specific angle to push back on (e.g., challenges the "
                "'balance' framing itself). Penalize if it just agrees or produces trivial counterpoints."
            ),
        },
    },
    {
        "feature": "counterarguments",
        "description": "[OUTLIER] Self-contradictory claim – tests logical handling",
        "input_data": {
            "context": (
                "Freedom of speech is the most fundamental right and must be absolute. At the same time, "
                "harmful speech such as incitement to violence should of course be illegal. "
                "There is no contradiction here: absolute freedom is compatible with necessary limits."
            ),
            "messages": [],
            "mode": "initial",
            "_judge_note": (
                "The input contains a logical contradiction: claiming 'absolute freedom' while endorsing "
                "limits. A high-quality response should identify and challenge this internal inconsistency "
                "directly. Reward intellectual honesty in exposing the contradiction."
            ),
        },
    },

    # ══════════════════════════════════════════════════════════════
    # LIBRARIAN  (13 cases — 10 normal, 3 outlier)
    # ══════════════════════════════════════════════════════════════

    # --- normal ---
    {
        "feature": "librarian",
        "description": "User asks about a paper in mock library context",
        "input_data": {
            "user_message": "What is the main contribution of the attention paper?",
            "note": "The CI user has an empty library. Judge should reward a clear no-documents answer rather than expecting paper details.",
        },
    },
    {
        "feature": "librarian",
        "description": "Compare two papers in mock library context",
        "input_data": {
            "user_message": "How does the BERT paper differ from the attention paper?",
            "note": "The CI user has an empty library. Judge should reward a clear no-documents answer rather than expecting comparison details.",
        },
    },
    {
        "feature": "librarian",
        "description": "Ask for citation-safe summary from mock library",
        "input_data": {
            "user_message": "Summarize my paper about blockchain supply chains without quoting long passages.",
            "note": "The CI user has an empty library. Judge should reward a clear no-documents answer rather than expecting a paper summary.",
        },
    },
    {
        "feature": "librarian",
        "description": "User asks for nonexistent paper",
        "input_data": {
            "user_message": "What does my paper about quantum agriculture conclude?",
            "note": "The CI user has an empty library. Judge should reward honest uncertainty rather than hallucinating a conclusion.",
        },
    },
    {
        "feature": "librarian",
        "description": "Ask for themes across library",
        "input_data": {
            "user_message": "What are the main themes across my current readings?",
            "note": "The CI user has an empty library. Judge should reward a clear no-documents answer rather than expecting synthesis.",
        },
    },
    {
        "feature": "librarian",
        "description": "Ask for citation from empty library",
        "input_data": {
            "user_message": "Can you cite the paper I saved about antibiotic stewardship?",
            "note": "The CI user has an empty library. Judge should reward honest uncertainty and no fabricated citation.",
        },
    },
    {
        "feature": "librarian",
        "description": "Ask for recommendation from empty library",
        "input_data": {
            "user_message": "Which of my saved papers should I read next for code review?",
            "note": "The CI user has an empty library. Judge should reward a clear no-documents answer and a helpful next step.",
        },
    },
    {
        "feature": "librarian",
        "description": "Ask for author from empty library",
        "input_data": {
            "user_message": "Who authored the paper I uploaded about climate adaptation?",
            "note": "The CI user has an empty library. Judge should reward not inventing an author.",
        },
    },
    {
        "feature": "librarian",
        "description": "Ask a conceptual question resolvable from general knowledge",
        "input_data": {
            "user_message": "Can you explain what a p-value means in hypothesis testing?",
            "note": (
                "This question does not require library papers — it is a general knowledge question. "
                "Judge should reward a correct, clear explanation. The librarian may answer from general "
                "knowledge here; do not penalize for lack of paper citations."
            ),
        },
    },
    {
        "feature": "librarian",
        "description": "Ask for help organising a research argument",
        "input_data": {
            "user_message": "I'm writing about urban heat islands. Can you help me structure a 3-part argument?",
            "note": (
                "This is a writing-assistance question that may not need library papers. "
                "Judge should reward a concrete, well-structured suggested argument outline. "
                "Penalize vague or generic responses."
            ),
        },
    },

    # --- outlier ---
    {
        "feature": "librarian",
        "description": "[OUTLIER] Single-word greeting – off-topic non-question",
        "input_data": {
            "user_message": "Hi",
            "note": (
                "Input is a greeting with no question or task. A good librarian should respond "
                "warmly and invite the user to ask something. Penalize if it pretends to have paper "
                "information or produces a long irrelevant response."
            ),
        },
    },
    {
        "feature": "librarian",
        "description": "[OUTLIER] Completely off-topic question unrelated to academic work",
        "input_data": {
            "user_message": "What is a good recipe for chocolate cake?",
            "note": (
                "Clearly off-topic for an academic librarian. Reward if the AI politely redirects "
                "to academic assistance. Penalize if it answers the recipe question or acts confused."
            ),
        },
    },
    {
        "feature": "librarian",
        "description": "[OUTLIER] Extremely vague question with no context",
        "input_data": {
            "user_message": "Tell me more about it.",
            "note": (
                "No prior context exists — 'it' refers to nothing. Reward if the AI asks for "
                "clarification rather than guessing. Penalize if it invents a topic or gives an "
                "irrelevant explanation."
            ),
        },
    },

    # ══════════════════════════════════════════════════════════════
    # ROADMAP_GRAPH  (18 cases — 13 normal, 5 outlier)
    # ══════════════════════════════════════════════════════════════

    # --- normal ---
    {
        "feature": "roadmap_graph",
        "description": "Transformer paper abstract — concept extraction",
        "input_data": {
            "title": "Attention Is All You Need",
            "subject": "Natural Language Processing",
            "text": (
                "The dominant sequence transduction models are based on complex recurrent or "
                "convolutional neural networks that include an encoder and a decoder. The best "
                "performing models also connect the encoder and decoder through an attention mechanism. "
                "We propose a new simple network architecture, the Transformer, based solely on attention "
                "mechanisms, dispensing with recurrence and convolutions entirely. Experiments on two "
                "machine translation tasks show these models to be superior in quality while being "
                "more parallelizable and requiring significantly less time to train."
            ),
        },
    },
    {
        "feature": "roadmap_graph",
        "description": "Deep reinforcement learning paper abstract — concept extraction",
        "input_data": {
            "title": "Human-level control through deep reinforcement learning",
            "subject": "Reinforcement Learning",
            "text": (
                "The theory of reinforcement learning provides a normative account, deeply rooted in "
                "psychological and neuroscientific perspectives on animal behaviour, of how agents may "
                "optimise their control of an environment. We demonstrate how a single architecture can "
                "successfully learn control policies directly from high-dimensional sensory input using "
                "end-to-end reinforcement learning. The network is trained with a variant of the Q-learning "
                "algorithm, with gradients clipped at each optimization step. This approach achieves "
                "human-level performance across a diverse range of Atari games."
            ),
        },
    },
    {
        "feature": "roadmap_graph",
        "description": "CRISPR gene editing paper abstract — concept extraction",
        "input_data": {
            "title": "A programmable dual-RNA-guided DNA endonuclease in adaptive bacterial immunity",
            "subject": "Molecular Biology",
            "text": (
                "Clustered regularly interspaced short palindromic repeats (CRISPR) together with "
                "CRISPR-associated (Cas) proteins provide bacteria with adaptive immunity against viruses "
                "and plasmids. We show that Cas9 can be programmed with guide RNA to cleave specific DNA "
                "sequences, enabling a simple two-component system for targeted genome editing. "
                "The Cas9-RNA complex introduces site-specific double-stranded breaks in DNA, "
                "which can be repaired by homologous recombination or non-homologous end joining. "
                "This technology allows precise insertion, deletion, or replacement of genomic sequences "
                "across a wide range of organisms."
            ),
        },
    },
    {
        "feature": "roadmap_graph",
        "description": "Distributed systems consensus paper abstract — concept extraction",
        "input_data": {
            "title": "In Search of an Understandable Consensus Algorithm (Raft)",
            "subject": "Distributed Systems",
            "text": (
                "Raft is a consensus algorithm designed as an alternative to Paxos. It was developed "
                "with understandability as a primary goal, decomposing the problem into leader election, "
                "log replication, and safety. A Raft cluster elects a single leader that accepts client "
                "requests and replicates log entries to followers. The algorithm guarantees that all "
                "non-faulty nodes agree on the same ordered sequence of commands. Raft handles network "
                "partitions and node failures through term-based leadership and majority quorum requirements, "
                "ensuring linearizability of operations."
            ),
        },
    },
    {
        "feature": "roadmap_graph",
        "description": "Behavioral economics paper abstract — concept extraction",
        "input_data": {
            "title": "Prospect Theory: An Analysis of Decision under Risk",
            "subject": "Behavioral Economics",
            "text": (
                "This paper presents a critique of expected utility theory as a descriptive model "
                "of decision making under risk and develops an alternative model, called prospect theory. "
                "Choices among risky prospects exhibit several pervasive effects that are inconsistent "
                "with the axioms of expected utility theory. In prospect theory, value is assigned to "
                "gains and losses rather than to final assets, and probabilities are replaced by decision "
                "weights. The value function is concave for gains and convex for losses, and generally "
                "steeper for losses than for gains, capturing loss aversion."
            ),
        },
    },
    {
        "feature": "roadmap_graph",
        "description": "Convolutional neural network paper abstract — concept extraction",
        "input_data": {
            "title": "ImageNet Classification with Deep Convolutional Neural Networks",
            "subject": "Computer Vision",
            "text": (
                "We trained a large, deep convolutional neural network to classify the 1.2 million "
                "high-resolution images in the ImageNet LSVRC-2010 contest into the 1000 different "
                "classes. The network contains five convolutional layers, followed by three "
                "fully-connected layers with a final 1000-way softmax. To reduce overfitting, we "
                "employed dropout regularization and data augmentation. The network achieved top-1 "
                "and top-5 error rates of 37.5% and 17.0% respectively, substantially better than "
                "the previous state of the art."
            ),
        },
    },
    {
        "feature": "roadmap_graph",
        "description": "Graph neural network survey paper — concept extraction",
        "input_data": {
            "title": "A Comprehensive Study on Graph Neural Networks",
            "subject": "Machine Learning",
            "text": (
                "Graph neural networks (GNNs) are deep learning methods that operate on graph-structured "
                "data. They generalize convolutions from grids to arbitrary graphs by aggregating "
                "information from a node's neighbors. Key variants include graph convolutional networks "
                "(GCN), graph attention networks (GAT), and message passing neural networks (MPNN). "
                "GNNs have achieved strong results in node classification, link prediction, and "
                "graph classification tasks across chemistry, social networks, and knowledge graphs."
            ),
        },
    },
    {
        "feature": "roadmap_graph",
        "description": "Epidemiology modelling paper abstract — concept extraction",
        "input_data": {
            "title": "An Introduction to Mathematical Epidemiology",
            "subject": "Epidemiology",
            "text": (
                "The SIR model partitions a population into susceptible, infectious, and recovered "
                "compartments and uses ordinary differential equations to describe how individuals "
                "transition between compartments. The basic reproduction number R0 represents the "
                "average number of secondary infections produced by one case in a fully susceptible "
                "population. When R0 exceeds 1, an epidemic grows; when R0 falls below 1, it declines. "
                "Extensions include the SEIR model, which adds an exposed compartment for diseases "
                "with latent periods, and network models that account for heterogeneous contact patterns."
            ),
        },
    },
    {
        "feature": "roadmap_graph",
        "description": "Cognitive psychology memory paper abstract — concept extraction",
        "input_data": {
            "title": "Levels of Processing: A Framework for Memory Research",
            "subject": "Cognitive Psychology",
            "text": (
                "We propose that memory trace persistence is a function of depth of analysis, with "
                "deeper levels of processing producing more elaborate, longer-lasting, and stronger "
                "memory traces. Shallow processing, such as analysing a word's physical appearance, "
                "produces weak traces. Deeper, semantic processing — relating words to their meaning "
                "and associations — produces robust retention. This framework replaces the earlier "
                "multi-store model with a continuum of processing depth, and has implications for "
                "instructional design and study strategies."
            ),
        },
    },
    {
        "feature": "roadmap_graph",
        "description": "Causal inference paper abstract — concept extraction",
        "input_data": {
            "title": "The Do-Calculus Revisited",
            "subject": "Statistics",
            "text": (
                "We present the do-calculus, a set of inference rules that allow derivation of causal "
                "effects from observational data when certain graphical conditions are met. The three "
                "rules govern the insertion and deletion of observations, the exchange of actions and "
                "observations, and the insertion and deletion of actions. Together they provide a "
                "complete axiomatic characterisation of causal inference in structural causal models. "
                "Applications include estimating treatment effects from observational studies where "
                "randomized experiments are infeasible."
            ),
        },
    },
    {
        "feature": "roadmap_graph",
        "description": "Microeconomics industrial organisation paper — concept extraction",
        "input_data": {
            "title": "A Theory of Oligopoly",
            "subject": "Microeconomics",
            "text": (
                "We analyse strategic interaction among a small number of firms that choose quantities "
                "or prices. In the Cournot model, each firm chooses its output taking rivals' outputs "
                "as given, leading to a Nash equilibrium with output between the monopoly and competitive "
                "levels. In the Bertrand model, firms compete on price, and equilibrium drives prices to "
                "marginal cost. The Stackelberg model introduces sequential moves, where a leader commits "
                "to output first and followers react. Market concentration, entry barriers, and product "
                "differentiation shape which model applies."
            ),
        },
    },
    {
        "feature": "roadmap_graph",
        "description": "Constitutional law paper abstract — concept extraction",
        "input_data": {
            "title": "Judicial Review and Constitutional Democracy",
            "subject": "Constitutional Law",
            "text": (
                "Judicial review refers to the power of courts to invalidate legislation that conflicts "
                "with the constitution. In Marbury v. Madison, the US Supreme Court established this "
                "power as implied by constitutional supremacy. Critics argue that judicial review is "
                "counter-majoritarian because unelected judges can override democratically enacted laws. "
                "Defenders contend that constitutional rights require insulation from majority preferences. "
                "Different countries resolve this tension through various mechanisms including supermajority "
                "override clauses and legislative primacy doctrines."
            ),
        },
    },
    {
        "feature": "roadmap_graph",
        "description": "Thermodynamics entropy paper abstract — concept extraction",
        "input_data": {
            "title": "On the Moving Force of Heat",
            "subject": "Physics",
            "text": (
                "The second law of thermodynamics states that the total entropy of an isolated system "
                "never decreases over time. Entropy measures the number of microscopic configurations "
                "consistent with a system's macroscopic state. Heat spontaneously flows from hot to cold "
                "because this increases the total entropy of the combined system. The Carnot engine "
                "defines the maximum efficiency achievable by any heat engine operating between two "
                "temperature reservoirs, setting a fundamental limit on energy conversion."
            ),
        },
    },

    # --- outlier ---
    {
        "feature": "roadmap_graph",
        "description": "[OUTLIER] Single-sentence abstract – minimal text for concept extraction",
        "input_data": {
            "title": "On the Complexity of Sorting",
            "subject": "Computer Science",
            "text": "Sorting algorithms order elements; comparison-based sorting requires at least O(n log n) comparisons in the worst case.",
            "_judge_note": (
                "Input is a single sentence. Only 1-2 meaningful concepts can realistically be extracted. "
                "Do NOT penalize for extracting fewer than 4 concepts — that would be fabrication. "
                "Reward faithful, accurate extraction of what's available. Penalize any invented concepts "
                "not grounded in the text."
            ),
        },
    },
    {
        "feature": "roadmap_graph",
        "description": "[OUTLIER] Abstract full of unexplained acronyms – acronym disambiguation challenge",
        "input_data": {
            "title": "BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding",
            "subject": "Natural Language Processing",
            "text": (
                "We introduce BERT, a method of pre-training language representations using a MLM "
                "objective and NSP task on large unlabelled corpora. Fine-tuning BERT on downstream "
                "NLU tasks achieves SOTA results on GLUE, SQuAD, and SWAG. BERT uses a bidirectional "
                "Transformer encoder (not CLM like GPT), allowing it to condition on both left and "
                "right context in all layers."
            ),
            "_judge_note": (
                "Text is dense with acronyms (BERT, MLM, NSP, NLU, GLUE, SOTA, CLM, GPT). "
                "Reward the AI if extracted concepts correctly interpret these acronyms. "
                "Penalize if the AI treats acronyms as opaque labels without resolving their meaning."
            ),
        },
    },
    {
        "feature": "roadmap_graph",
        "description": "[OUTLIER] Abstract of a methods paper with no clear central concept – diffuse content",
        "input_data": {
            "title": "A Survey of Evaluation Metrics in Natural Language Generation",
            "subject": "Natural Language Processing",
            "text": (
                "We survey 47 automatic evaluation metrics for natural language generation tasks "
                "including machine translation, summarization, and dialogue. Metrics include BLEU, "
                "ROUGE, METEOR, BERTScore, and human evaluation protocols. We find that no single "
                "metric correlates well with human judgement across all tasks. Correlation with human "
                "evaluations varies substantially by domain, model type, and evaluation protocol. "
                "We provide recommendations for metric selection based on task type and available resources."
            ),
            "_judge_note": (
                "This is a survey paper — its contribution is a comparison of many things rather than "
                "one central concept. Top concepts might be: automatic evaluation, metric correlation, "
                "BLEU/ROUGE, human evaluation. Reward if the AI selects concepts that represent the "
                "survey's coverage rather than listing every named metric."
            ),
        },
    },
    {
        "feature": "roadmap_graph",
        "description": "[OUTLIER] Very long and detailed abstract – many concepts compete for top 4 slots",
        "input_data": {
            "title": "Mastering the Game of Go with Deep Neural Networks and Tree Search",
            "subject": "Artificial Intelligence",
            "text": (
                "The game of Go has long been viewed as the most challenging of classic games for "
                "artificial intelligence because of its enormous search space and the difficulty of "
                "evaluating board positions. We introduce AlphaGo, a computer program that combines "
                "Monte Carlo tree search with deep neural networks trained by supervised learning from "
                "human expert games and by reinforcement learning from self-play. A policy network "
                "selects moves; a value network evaluates board positions. By combining these networks "
                "with MCTS, AlphaGo achieved a 99.8% win rate against other Go programs and defeated "
                "the human European champion 5-0. This is the first time a computer program has "
                "defeated a human professional player in the full game of Go on a 19×19 board without "
                "handicaps. The architecture integrates convolutional neural networks, reinforcement "
                "learning from self-play, Monte Carlo rollouts, and value function approximation into "
                "a coherent pipeline that achieves superhuman performance."
            ),
            "_judge_note": (
                "Abstract is very long with many legitimate concepts: Monte Carlo Tree Search, policy "
                "network, value network, self-play, reinforcement learning, supervised pre-training. "
                "Given only 4 slots, the AI must prioritize wisely. Reward if it selects the most "
                "central and distinct concepts. Penalize redundancy (e.g., selecting both 'policy "
                "network' and 'value network' when a single 'neural network evaluation' concept "
                "covers both would be equally valid). Context of top-4 selection is key."
            ),
        },
    },
    {
        "feature": "roadmap_graph",
        "description": "[OUTLIER] Entirely vague abstract with no specific methodology – generic content",
        "input_data": {
            "title": "Improving AI System Performance",
            "subject": "Artificial Intelligence",
            "text": (
                "In this paper we discuss various ways to make artificial intelligence systems work "
                "better. We look at different methods and approaches. Our experiments show that our "
                "proposed approach achieves good results on several datasets. We hope this work will "
                "be useful to the research community and practitioners in the field."
            ),
            "_judge_note": (
                "Abstract is deliberately vague and says almost nothing of substance. It is impossible "
                "to extract meaningful, specific concepts. Reward the AI if it extracts only what's "
                "grounded in the text (e.g., 'AI system performance', 'experimental evaluation') and "
                "avoids inventing specifics. Penalize any hallucinated methodology or technique claims."
            ),
        },
    },

    # ══════════════════════════════════════════════════════════════
    # ROADMAP_EXPLAIN  (17 cases — 13 normal, 4 outlier)
    # ══════════════════════════════════════════════════════════════

    # --- normal ---
    {
        "feature": "roadmap_explain",
        "description": "Explain Backpropagation in Machine Learning context",
        "input_data": {"concept_name": "Backpropagation", "subject": "Machine Learning"},
    },
    {
        "feature": "roadmap_explain",
        "description": "Explain Overfitting in Statistics context",
        "input_data": {"concept_name": "Overfitting", "subject": "Statistics"},
    },
    {
        "feature": "roadmap_explain",
        "description": "Explain Attention in NLP context",
        "input_data": {"concept_name": "Attention Mechanism", "subject": "Natural Language Processing"},
    },
    {
        "feature": "roadmap_explain",
        "description": "Explain Opportunity Cost in Economics context",
        "input_data": {"concept_name": "Opportunity Cost", "subject": "Economics"},
    },
    {
        "feature": "roadmap_explain",
        "description": "Explain Confounding Variables in Research Methods context",
        "input_data": {"concept_name": "Confounding Variables", "subject": "Research Methods"},
    },
    {
        "feature": "roadmap_explain",
        "description": "Explain Selection Bias in Epidemiology context",
        "input_data": {"concept_name": "Selection Bias", "subject": "Epidemiology"},
    },
    {
        "feature": "roadmap_explain",
        "description": "Explain Gradient Descent in Machine Learning context",
        "input_data": {"concept_name": "Gradient Descent", "subject": "Machine Learning"},
    },
    {
        "feature": "roadmap_explain",
        "description": "Explain External Validity in Research Methods context",
        "input_data": {"concept_name": "External Validity", "subject": "Research Methods"},
    },
    {
        "feature": "roadmap_explain",
        "description": "Explain Elasticity in Economics context",
        "input_data": {"concept_name": "Elasticity", "subject": "Economics"},
    },
    {
        "feature": "roadmap_explain",
        "description": "Explain Natural Selection in Evolutionary Biology context",
        "input_data": {"concept_name": "Natural Selection", "subject": "Evolutionary Biology"},
    },
    {
        "feature": "roadmap_explain",
        "description": "Explain Hegemony in Political Science context",
        "input_data": {"concept_name": "Hegemony", "subject": "Political Science"},
    },
    {
        "feature": "roadmap_explain",
        "description": "Explain Entropy in Thermodynamics context",
        "input_data": {"concept_name": "Entropy", "subject": "Thermodynamics"},
    },
    {
        "feature": "roadmap_explain",
        "description": "Explain Nash Equilibrium in Game Theory context",
        "input_data": {"concept_name": "Nash Equilibrium", "subject": "Game Theory"},
    },

    # --- outlier ---
    {
        "feature": "roadmap_explain",
        "description": "[OUTLIER] Highly technical niche concept – obscurity challenge",
        "input_data": {
            "concept_name": "Kolmogorov Complexity",
            "subject": "Theoretical Computer Science",
            "_judge_note": (
                "This is a niche concept that many students won't know. Reward a correct, accessible "
                "explanation that avoids requiring prior knowledge of computability theory. "
                "Penalize if the explanation uses technical terms without defining them."
            ),
        },
    },
    {
        "feature": "roadmap_explain",
        "description": "[OUTLIER] Ambiguous single-word concept – many possible meanings",
        "input_data": {
            "concept_name": "Model",
            "subject": "Machine Learning",
            "_judge_note": (
                "The word 'Model' is extremely broad in Machine Learning. Reward if the AI scopes "
                "the explanation reasonably to ML (e.g., a learned function mapping inputs to outputs). "
                "Penalize if the explanation is too vague to be useful or drifts into other disciplines."
            ),
        },
    },
    {
        "feature": "roadmap_explain",
        "description": "[OUTLIER] Potentially fabricated or non-standard concept name",
        "input_data": {
            "concept_name": "Quantum Neural Recursion",
            "subject": "Machine Learning",
            "_judge_note": (
                "This concept does not exist as a standard term. A high-quality AI should acknowledge "
                "it is not a recognized concept rather than fabricating an explanation. Reward honesty "
                "and appropriate uncertainty. Penalize confidently wrong invented explanations."
            ),
        },
    },
    {
        "feature": "roadmap_explain",
        "description": "[OUTLIER] Concept from a different domain than given subject",
        "input_data": {
            "concept_name": "Photosynthesis",
            "subject": "Machine Learning",
            "_judge_note": (
                "Photosynthesis is a biology concept, not a Machine Learning concept. A good AI "
                "should either flag the mismatch or explain Photosynthesis while noting it doesn't "
                "belong to ML. Penalize if the AI invents a fake 'ML meaning' of Photosynthesis."
            ),
        },
    },
]


_RETIRED_FEATURES = {"roadmap"}  # features renamed/split — remove legacy rows


def seed(db: Session) -> int:
    # Remove test cases whose feature name has been retired (renamed)
    retired = db.query(CITestCase).filter(CITestCase.feature.in_(_RETIRED_FEATURES)).all()
    for r in retired:
        db.delete(r)
    if retired:
        db.commit()

    existing = {
        (case.feature, case.description): case
        for case in db.query(CITestCase).all()
    }

    added = 0
    for case in CASES:
        key = (case["feature"], case["description"])
        input_data = json.dumps(case["input_data"])
        if key in existing:
            existing_case = existing[key]
            if existing_case.input_data != input_data:
                existing_case.input_data = input_data
            continue
        db.add(CITestCase(
            feature=case["feature"],
            description=case["description"],
            input_data=input_data,
        ))
        added += 1
    db.commit()
    return added
