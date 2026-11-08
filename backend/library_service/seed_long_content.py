"""
Long-form full text (~20 pages, ~7000 words) for selected seed papers.
Used for testing summary, quiz, and highlights on research-paper-length content.
"""

# ~20 pages at 400 words/page ≈ 7200 words. Section word targets.
_WORDS_PER_SECTION = {
    "abstract": 120,
    "intro": 1250,
    "related": 1250,
    "method": 1350,
    "experiments": 1550,
    "discussion": 1250,
    "conclusion": 280,
}


def _expand_with(base_sentences: list[str], templates: list[str], target_words: int) -> str:
    out = []
    word_count = 0
    s_idx, t_idx = 0, 0
    while word_count < target_words:
        if base_sentences:
            s = base_sentences[s_idx % len(base_sentences)].strip()
            if s and not s.endswith("."):
                s = s + "."
            out.append(s)
            word_count += len(s.split())
            s_idx += 1
        t = templates[t_idx % len(templates)]
        out.append(t)
        word_count += len(t.split())
        t_idx += 1
    return " ".join(out)


def long_full_text_neural_architectures() -> str:
    """~7000 words for 'Neural Network Architectures for Image Recognition'."""
    base = (
        "Neural networks have revolutionized the field of image recognition. "
        "We examine several architectures including CNNs, ResNets, and transformer-based models. "
        "ResNets achieve superior performance on standard benchmarks while maintaining efficiency. "
        "Skip connections allow gradients to flow more effectively during training. "
        "We investigate data augmentation and its impact on model generalization. "
        "Proper augmentation improves robustness to lighting, scale, and orientation. "
        "We explore transfer learning for effective training with limited data."
    )
    s = [x.strip() + "." for x in base.split(". ") if x.strip()]

    intro_t = [
        "The problem of scalable and accurate image recognition remains central to computer vision.",
        "Recent advances in deep learning have enabled substantial gains across many visual recognition tasks.",
        "In this work we provide a systematic comparison of representative architectures and training strategies.",
        "We focus on computational efficiency and generalization in addition to raw accuracy.",
        "Our experiments span multiple datasets and evaluation protocols to ensure robust conclusions.",
        "The remainder of this paper is organized as follows.",
    ]
    related_t = [
        "Prior work on convolutional architectures has established the importance of hierarchical feature learning.",
        "Residual connections have been shown to ease optimization in very deep networks.",
        "Transformer-based vision models have recently achieved strong results on large-scale benchmarks.",
        "Data augmentation and regularization strategies are critical for generalization.",
        "Transfer learning from large pretrained models has become standard in many applications.",
        "We build upon these foundations and compare them under a unified experimental setup.",
    ]
    method_t = [
        "We implement each architecture using a common training pipeline and hyperparameter schedule.",
        "All models are trained with the same optimizer, learning rate schedule, and batch size.",
        "We use standard data augmentation including random crops, flips, and color jitter.",
        "Evaluation is performed on held-out test sets with standard metrics.",
        "We report top-1 and top-5 accuracy as well as inference latency and parameter count.",
        "Ablation studies isolate the effect of key design choices.",
    ]
    exp_t = [
        "Experiments on ImageNet and CIFAR-100 confirm the advantages of residual and attention-based designs.",
        "ResNets achieve strong accuracy-efficiency trade-offs across depth and width.",
        "Vision transformers require more data and compute but match or exceed CNNs at scale.",
        "Data augmentation consistently improves generalization across all architectures.",
        "Transfer learning from pretrained models significantly boosts performance on smaller datasets.",
        "We provide detailed tables and figures in the appendix.",
    ]
    disc_t = [
        "Our results suggest that both inductive biases and scale play important roles.",
        "Practitioners should choose architectures based on data size, compute budget, and latency constraints.",
        "Future work may unify convolutional and attention-based designs more tightly.",
        "We release code and checkpoints to support reproducibility.",
    ]
    conc_t = [
        "We presented a systematic study of neural architectures for image recognition.",
        "ResNets and transformers offer complementary strengths; data augmentation and transfer learning remain essential.",
    ]

    def sec(name: str, templates: list[str]) -> str:
        n = _WORDS_PER_SECTION[name]
        return _expand_with(s, templates, n)

    abstract = " ".join((" ".join(s)).split()[: _WORDS_PER_SECTION["abstract"]])

    parts = [
        "ABSTRACT\n\n" + abstract,
        "1. INTRODUCTION\n\n" + sec("intro", intro_t),
        "2. RELATED WORK\n\n" + sec("related", related_t),
        "3. METHODOLOGY\n\n" + sec("method", method_t),
        "4. EXPERIMENTS AND RESULTS\n\n" + sec("experiments", exp_t),
        "5. DISCUSSION\n\n" + sec("discussion", disc_t),
        "6. CONCLUSION\n\n" + sec("conclusion", conc_t),
    ]
    return "\n\n".join(parts)


def long_full_text_nlp_survey() -> str:
    """~7000 words for 'Deep Learning Applications in Natural Language Processing'."""
    base = (
        "Natural language processing has been transformed by deep learning. "
        "We survey transformers, attention mechanisms, and language models. "
        "Large language models show remarkable capabilities in understanding and generating text. "
        "Challenges remain in bias mitigation, interpretability, and efficiency. "
        "We present case studies on sentiment analysis, machine translation, and question answering. "
        "We examine multilingual models and transfer across languages. "
        "Ethical considerations including fairness and environmental impact are discussed."
    )
    s = [x.strip() + "." for x in base.split(". ") if x.strip()]

    intro_t = [
        "The rise of large-scale neural models has reshaped natural language processing.",
        "Attention mechanisms and transformer architectures now underpin most state-of-the-art systems.",
        "This survey reviews key developments and applications across tasks and domains.",
        "We emphasize both capabilities and limitations, including societal and environmental concerns.",
        "Our goal is to provide a concise but representative overview for researchers and practitioners.",
        "We structure the survey by paradigm and then by application area.",
    ]
    related_t = [
        "Early neural NLP relied on recurrent and convolutional architectures.",
        "The transformer architecture has largely supplanted recurrent models for sequence modeling.",
        "Pretrained language models have enabled effective transfer across many downstream tasks.",
        "Multilingual and cross-lingual models aim to extend benefits to lower-resource languages.",
        "Interpretability and robustness of large models remain active research directions.",
        "We build on these lines of work and summarize recent empirical findings.",
    ]
    method_t = [
        "We categorize methods by architecture, pretraining objective, and task setup.",
        "We discuss tokenization, positional encodings, and other design choices.",
        "Evaluation benchmarks and metrics vary by task; we adopt widely used standards.",
        "We consider efficiency in terms of parameters, compute, and inference latency.",
        "Fairness and bias metrics are discussed where relevant.",
        "Our taxonomy is intended to guide readers through the literature.",
    ]
    exp_t = [
        "Empirical results consistently show gains from scale and pretraining.",
        "Task-specific fine-tuning typically outperforms zero-shot and few-shot setups when data allow.",
        "Multilingual models reduce the gap for lower-resource languages but disparities remain.",
        "Efficiency improvements via distillation and pruning are increasingly important.",
        "We cite representative results; comprehensive tables are available in referenced works.",
        "Reproducibility and reporting standards continue to evolve.",
    ]
    disc_t = [
        "The dominance of large pretrained models raises questions about accessibility and environmental cost.",
        "Bias and misuse remain serious concerns; mitigation and governance are active topics.",
        "Future work may favor more efficient or modular alternatives to monolithic LMs.",
        "We encourage researchers to consider broader impacts when developing and deploying NLP systems.",
    ]
    conc_t = [
        "We surveyed deep learning approaches in NLP, with emphasis on transformers and language models.",
        "Progress has been rapid; responsible development and deployment remain critical.",
    ]

    def sec(name: str, templates: list[str]) -> str:
        n = _WORDS_PER_SECTION[name]
        return _expand_with(s, templates, n)

    abstract = " ".join((" ".join(s)).split()[: _WORDS_PER_SECTION["abstract"]])

    parts = [
        "ABSTRACT\n\n" + abstract,
        "1. INTRODUCTION\n\n" + sec("intro", intro_t),
        "2. RELATED WORK\n\n" + sec("related", related_t),
        "3. METHODOLOGY AND TAXONOMY\n\n" + sec("method", method_t),
        "4. EMPIRICAL RESULTS AND BENCHMARKS\n\n" + sec("experiments", exp_t),
        "5. DISCUSSION\n\n" + sec("discussion", disc_t),
        "6. CONCLUSION\n\n" + sec("conclusion", conc_t),
    ]
    return "\n\n".join(parts)


def long_full_text_reinforcement_learning() -> str:
    """~7000 words for 'Deep Reinforcement Learning for Autonomous Systems'."""
    base = (
        "Autonomous systems require sophisticated decision-making that adapts to dynamic environments. "
        "We present a deep reinforcement learning framework for training autonomous agents. "
        "We use policy gradient and actor-critic methods to learn from sparse rewards. "
        "Safety constraints are incorporated directly into the learning process. "
        "Experiments on simulated and real-world scenarios demonstrate effectiveness. "
        "We address sim-to-real transfer and robustness under varying conditions."
    )
    s = [x.strip() + "." for x in base.split(". ") if x.strip()]

    intro_t = [
        "Autonomous vehicles and robots must make safe, robust decisions in uncertain environments.",
        "Reinforcement learning offers a flexible paradigm for learning control policies from interaction.",
        "Scaling RL to high-dimensional, continuous action spaces remains challenging.",
        "We propose a framework that integrates safety constraints and sim-to-real transfer.",
        "We evaluate on both simulation benchmarks and physical platforms.",
        "The rest of the paper outlines related work, methods, experiments, and discussion.",
    ]
    related_t = [
        "Classical control and planning methods have long been used in autonomous systems.",
        "Deep RL has achieved notable success in games, simulation, and selected real-world tasks.",
        "Safe RL and constrained MDPs provide a formalism for incorporating safety.",
        "Sim-to-real transfer has been addressed via domain randomization and system identification.",
        "Actor-critic and policy gradient methods are widely used in continuous control.",
        "We combine these ideas in a unified framework and evaluate rigorously.",
    ]
    method_t = [
        "We formulate the problem as a constrained Markov decision process.",
        "We use an actor-critic architecture with separate policy and value networks.",
        "Safety constraints are enforced via constrained optimization during policy updates.",
        "We employ domain randomization and tailored sim-to-real procedures.",
        "Training is conducted in simulation; we then transfer to real hardware with minimal fine-tuning.",
        "We describe network architectures, hyperparameters, and reward shaping in detail.",
    ]
    exp_t = [
        "We evaluate in simulated urban driving and robotic manipulation scenarios.",
        "Our method achieves higher success rates and fewer constraint violations than baselines.",
        "Ablations confirm the importance of safety constraints and domain randomization.",
        "Real-world tests on a subset of scenarios show promising transfer performance.",
        "We discuss failure modes and remaining gaps between simulation and reality.",
        "Additional results and videos are provided in the supplementary material.",
    ]
    disc_t = [
        "Sim-to-real transfer remains imperfect; further work on robustness and adaptation is needed.",
        "Safety guarantees in RL are often empirical; formal verification is an open direction.",
        "We release simulation environments and code to support reproducibility.",
        "Practical deployment will require continued work on robustness and interpretability.",
    ]
    conc_t = [
        "We presented a deep RL framework for autonomous systems with safety constraints and sim-to-real transfer.",
        "Experiments in simulation and on physical systems demonstrate the potential and limitations of the approach.",
    ]

    def sec(name: str, templates: list[str]) -> str:
        n = _WORDS_PER_SECTION[name]
        return _expand_with(s, templates, n)

    abstract = " ".join((" ".join(s)).split()[: _WORDS_PER_SECTION["abstract"]])

    parts = [
        "ABSTRACT\n\n" + abstract,
        "1. INTRODUCTION\n\n" + sec("intro", intro_t),
        "2. RELATED WORK\n\n" + sec("related", related_t),
        "3. METHODOLOGY\n\n" + sec("method", method_t),
        "4. EXPERIMENTS AND RESULTS\n\n" + sec("experiments", exp_t),
        "5. DISCUSSION\n\n" + sec("discussion", disc_t),
        "6. CONCLUSION\n\n" + sec("conclusion", conc_t),
    ]
    return "\n\n".join(parts)


# Titles that use long-form content (~20 pages). All others use expanded short form (~3–4 pages).
LONG_PAPER_TITLES = {
    "Neural Network Architectures for Image Recognition",
    "Deep Learning Applications in Natural Language Processing",
    "Deep Reinforcement Learning for Autonomous Systems",
}

def get_long_full_text(title: str) -> str | None:
    if title == "Neural Network Architectures for Image Recognition":
        return long_full_text_neural_architectures()
    if title == "Deep Learning Applications in Natural Language Processing":
        return long_full_text_nlp_survey()
    if title == "Deep Reinforcement Learning for Autonomous Systems":
        return long_full_text_reinforcement_learning()
    return None
