"""Seed the database with sample papers"""
import json
from app.db.base import Base
from app.db.session import engine, SessionLocal
from app.db.models.paper import Paper
from app.db.models.highlight import Highlight  # noqa: ensure table exists

try:
    from seed_long_content import get_long_full_text
except ImportError:
    get_long_full_text = None


def _expand_full_text(short_text: str, target_words: int) -> str:
    """Expand short abstract-style text to ~target_words for 3--4 page papers."""
    s = [x.strip() + "." for x in short_text.replace("\n", " ").split(".") if x.strip()]
    if not s:
        return short_text
    extras = [
        "We evaluate our approach on standard benchmarks and report results accordingly.",
        "Ablation studies confirm the contribution of each main component.",
        "Related work in this area has grown considerably; we summarize key prior results.",
        "Our methodology follows established practices while introducing several refinements.",
        "The remainder of this paper elaborates on these points and presents empirical findings.",
        "We discuss limitations and potential extensions in the final section.",
    ]
    out = []
    w = 0
    i, j = 0, 0
    while w < target_words:
        out.append(s[i % len(s)])
        w += len(s[i % len(s)].split())
        i += 1
        out.append(extras[j % len(extras)])
        w += len(extras[j % len(extras)].split())
        j += 1
    return " ".join(out)


def seed_papers():
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        # Check if papers already exist
        existing_count = db.query(Paper).count()
        if existing_count > 0:
            print(f"Found {existing_count} existing papers. Adding more...")
        
        sample_papers = [
            # Machine Learning Papers
            {
                "title": "Neural Network Architectures for Image Recognition",
                "authors": ["John Smith", "Jane Doe", "Michael Chen"],
                "publication_year": 2023,
                "subject": "Machine Learning",
                "summary": "This paper explores various neural network architectures specifically designed for image recognition tasks, comparing their performance and efficiency.",
                "full_text": "Neural networks have revolutionized the field of image recognition. In this paper, we examine several architectures including convolutional neural networks (CNNs), residual networks (ResNets), and transformer-based models. Our experiments show that ResNets achieve superior performance on standard benchmarks while maintaining computational efficiency. The key innovation lies in the skip connections that allow gradients to flow more effectively during training. We also investigate the impact of data augmentation techniques on model generalization. Our results demonstrate that proper augmentation strategies can significantly improve model robustness to variations in lighting, scale, and orientation. Additionally, we explore transfer learning approaches that enable effective training with limited data. The paper concludes with a discussion of future directions in computer vision research."
            },
            {
                "title": "Deep Reinforcement Learning for Autonomous Systems",
                "authors": ["Sarah Johnson", "David Lee"],
                "publication_year": 2024,
                "subject": "Machine Learning",
                "summary": "A comprehensive study on applying deep reinforcement learning techniques to autonomous vehicle navigation and control systems.",
                "full_text": "Autonomous systems require sophisticated decision-making capabilities that can adapt to complex and dynamic environments. This paper presents a deep reinforcement learning framework for training autonomous agents. We utilize policy gradient methods and actor-critic architectures to enable learning from sparse rewards. Our approach incorporates safety constraints directly into the learning process, ensuring that learned policies satisfy critical safety requirements. Experimental results on simulated and real-world scenarios demonstrate the effectiveness of our method. The system successfully navigates complex traffic situations, handles unexpected obstacles, and maintains safe operation under various weather conditions. We also address the challenge of sim-to-real transfer, proposing techniques to bridge the gap between simulation and physical deployment."
            },
            {
                "title": "Federated Learning: Privacy-Preserving Machine Learning",
                "authors": ["Emily Wang", "Robert Brown", "Lisa Anderson"],
                "publication_year": 2023,
                "subject": "Machine Learning",
                "summary": "This research investigates federated learning approaches that enable model training across distributed data sources while preserving privacy.",
                "full_text": "Federated learning has emerged as a promising paradigm for training machine learning models without centralizing sensitive data. This paper presents a comprehensive analysis of federated learning algorithms, focusing on communication efficiency and privacy guarantees. We propose novel aggregation strategies that reduce communication overhead while maintaining model accuracy. Differential privacy techniques are integrated to provide formal privacy guarantees. Our experiments on various datasets demonstrate that federated learning can achieve performance comparable to centralized training while significantly reducing privacy risks. We also explore challenges such as non-IID data distribution and system heterogeneity, proposing solutions that improve robustness and fairness across participating clients."
            },
            
            # Natural Language Processing Papers
            {
                "title": "Deep Learning Applications in Natural Language Processing",
                "authors": ["Alice Johnson", "Bob Williams", "Carol Martinez"],
                "publication_year": 2022,
                "subject": "Natural Language Processing",
                "summary": "A comprehensive survey of deep learning techniques applied to natural language processing tasks, covering transformers, attention mechanisms, and language models.",
                "full_text": "Natural language processing has been transformed by deep learning approaches. This paper provides a comprehensive overview of recent advances in the field. We discuss the evolution from recurrent neural networks to transformer architectures, highlighting the importance of attention mechanisms. Large language models have shown remarkable capabilities in understanding and generating human-like text. However, challenges remain in areas such as bias mitigation, interpretability, and computational efficiency. We present case studies on sentiment analysis, machine translation, and question answering systems. The paper also examines multilingual models and their ability to transfer knowledge across languages. Ethical considerations in NLP development are discussed, including issues of fairness, transparency, and environmental impact."
            },
            {
                "title": "Transformer Models for Multilingual Machine Translation",
                "authors": ["James Wilson", "Maria Garcia"],
                "publication_year": 2024,
                "subject": "Natural Language Processing",
                "summary": "An investigation into transformer-based architectures for improving machine translation quality across multiple language pairs.",
                "full_text": "Machine translation has seen dramatic improvements with the advent of transformer architectures. This paper focuses on multilingual translation systems that can handle multiple language pairs within a single model. We explore various architectural modifications that improve translation quality for low-resource languages. Cross-lingual transfer learning techniques enable the model to leverage high-resource language pairs to improve performance on low-resource pairs. Our experiments cover over 100 language pairs, demonstrating significant improvements in translation quality. We also investigate the role of pre-training strategies and fine-tuning approaches in achieving optimal performance. The paper includes detailed analysis of translation errors and proposes methods for error correction and quality estimation."
            },
            {
                "title": "Sentiment Analysis Using Large Language Models",
                "authors": ["Thomas Anderson", "Jennifer White"],
                "publication_year": 2023,
                "subject": "Natural Language Processing",
                "summary": "This study evaluates the effectiveness of large language models for sentiment analysis tasks across different domains and languages.",
                "full_text": "Sentiment analysis is a fundamental task in natural language processing with applications in social media monitoring, customer feedback analysis, and market research. This paper presents a comprehensive evaluation of large language models for sentiment analysis. We compare fine-tuned models with zero-shot and few-shot approaches, analyzing their performance across different domains including product reviews, social media posts, and news articles. Our results show that fine-tuned models achieve the best performance, but zero-shot approaches offer competitive results with minimal training data. We also explore domain adaptation techniques that improve model performance on out-of-domain data. The paper discusses challenges such as handling sarcasm, irony, and context-dependent sentiment, proposing solutions that improve model robustness."
            },
            
            # Quantum Computing Papers
            {
                "title": "Quantum Computing Algorithms for Optimization Problems",
                "authors": ["Charlie Brown", "Diana Prince", "Edward Norton"],
                "publication_year": 2024,
                "subject": "Quantum Computing",
                "summary": "This research investigates quantum algorithms for solving complex optimization problems, comparing quantum approaches with classical methods.",
                "full_text": "Quantum computing offers promising solutions for optimization problems that are intractable for classical computers. In this paper, we explore quantum algorithms such as the Quantum Approximate Optimization Algorithm (QAOA) and Variational Quantum Eigensolver (VQE). Our experiments demonstrate that quantum algorithms can find near-optimal solutions faster than classical approaches for certain problem classes. However, current quantum hardware limitations, including noise and decoherence, present significant challenges. We discuss error mitigation techniques and hybrid quantum-classical approaches that show promise for near-term quantum devices. The paper also examines quantum advantage in optimization, identifying problem characteristics that make them suitable for quantum algorithms. We present case studies on portfolio optimization, scheduling problems, and graph partitioning."
            },
            {
                "title": "Quantum Machine Learning: Algorithms and Applications",
                "authors": ["Fiona Green", "George Harris"],
                "publication_year": 2023,
                "subject": "Quantum Computing",
                "summary": "An exploration of quantum machine learning algorithms and their potential applications in various domains.",
                "full_text": "Quantum machine learning combines quantum computing with machine learning to potentially achieve exponential speedups for certain learning tasks. This paper surveys quantum machine learning algorithms including quantum neural networks, quantum support vector machines, and quantum clustering algorithms. We analyze the theoretical advantages and practical limitations of these approaches. Quantum feature maps enable the encoding of classical data into quantum states, potentially revealing patterns not accessible to classical methods. Our experiments on quantum simulators demonstrate promising results for classification and regression tasks. However, the practical realization of quantum advantage requires significant advances in quantum hardware. We discuss near-term applications and long-term prospects for quantum machine learning."
            },
            
            # Blockchain Papers
            {
                "title": "Blockchain Technology in Supply Chain Management",
                "authors": ["Eve Adams", "Frank Miller", "Grace Taylor"],
                "publication_year": 2023,
                "subject": "Blockchain",
                "summary": "An analysis of how blockchain technology can improve transparency, traceability, and efficiency in supply chain management systems.",
                "full_text": "Blockchain technology has the potential to revolutionize supply chain management by providing immutable records of transactions and product movements. This paper examines real-world implementations of blockchain in various industries, including food safety, pharmaceuticals, and luxury goods. We analyze the benefits of increased transparency and traceability, which help combat counterfeiting and ensure product authenticity. Smart contracts enable automated execution of agreements, reducing administrative overhead. However, challenges such as scalability, interoperability, and energy consumption must be addressed for widespread adoption. We present case studies from major corporations that have implemented blockchain solutions, analyzing their successes and failures. The paper also discusses regulatory considerations and standardization efforts in the blockchain space."
            },
            {
                "title": "Smart Contracts and Decentralized Applications",
                "authors": ["Henry Chen", "Isabella Rodriguez"],
                "publication_year": 2024,
                "subject": "Blockchain",
                "summary": "This paper explores the development and security aspects of smart contracts and decentralized applications (DApps).",
                "full_text": "Smart contracts are self-executing contracts with terms directly written into code, enabling trustless transactions on blockchain networks. This paper provides a comprehensive overview of smart contract development, security vulnerabilities, and best practices. We analyze common attack vectors including reentrancy attacks, integer overflow, and access control issues. Formal verification techniques are discussed as a means to ensure contract correctness. The paper also examines decentralized application architectures, comparing different blockchain platforms and their capabilities. Case studies of successful DApps are presented, along with lessons learned from high-profile security incidents. We propose frameworks for secure smart contract development and auditing processes."
            },
            
            # Industrial IoT Papers
            {
                "title": "Machine Learning for Predictive Maintenance in Industrial Systems",
                "authors": ["Grace Lee", "Henry Chen", "Julia Kim"],
                "publication_year": 2023,
                "subject": "Industrial IoT",
                "summary": "This study presents machine learning models for predicting equipment failures in industrial settings, enabling proactive maintenance strategies.",
                "full_text": "Predictive maintenance is crucial for minimizing downtime and reducing maintenance costs in industrial systems. This paper presents machine learning approaches for predicting equipment failures before they occur. We utilize sensor data from industrial equipment to train models that can identify early warning signs of potential failures. Our methodology combines time-series analysis with deep learning techniques to achieve high prediction accuracy. Case studies in manufacturing and energy sectors demonstrate significant cost savings and improved reliability. The integration of IoT sensors with machine learning models creates a powerful framework for smart manufacturing. We also address challenges such as data quality, model interpretability, and integration with existing maintenance systems."
            },
            {
                "title": "IoT Security: Challenges and Solutions for Industrial Networks",
                "authors": ["Kevin Park", "Laura Davis"],
                "publication_year": 2024,
                "subject": "Industrial IoT",
                "summary": "An analysis of security challenges in industrial IoT deployments and proposed solutions for protecting critical infrastructure.",
                "full_text": "Industrial IoT systems face unique security challenges due to their critical role in infrastructure and the long lifecycle of industrial equipment. This paper identifies key security threats including unauthorized access, data tampering, and denial-of-service attacks. We propose a comprehensive security framework that addresses device authentication, secure communication, and intrusion detection. Lightweight cryptographic protocols are essential for resource-constrained IoT devices. The paper also discusses security standards and best practices for industrial IoT deployments. Case studies of security incidents and their impacts are analyzed to inform future security measures. We emphasize the importance of security-by-design principles and regular security audits."
            },
            
            # Cybersecurity Papers
            {
                "title": "Advanced Persistent Threats: Detection and Mitigation",
                "authors": ["Mark Thompson", "Nancy Wilson"],
                "publication_year": 2023,
                "subject": "Cybersecurity",
                "summary": "This research focuses on detecting and mitigating advanced persistent threats (APTs) in enterprise networks.",
                "full_text": "Advanced persistent threats represent a significant challenge for cybersecurity professionals. These sophisticated, long-term attacks are designed to evade traditional security measures. This paper presents a multi-layered detection framework that combines behavioral analysis, machine learning, and threat intelligence. We analyze attack patterns and develop signatures for identifying APT activities. The framework includes network monitoring, endpoint detection, and log analysis components. Case studies of real APT campaigns are examined to understand their tactics, techniques, and procedures. We propose mitigation strategies including network segmentation, access controls, and incident response procedures. The paper emphasizes the importance of threat hunting and continuous monitoring in defending against APTs."
            },
            {
                "title": "Zero-Trust Architecture for Modern Networks",
                "authors": ["Oliver Stone", "Patricia Moore"],
                "publication_year": 2024,
                "subject": "Cybersecurity",
                "summary": "An exploration of zero-trust security models and their implementation in enterprise networks.",
                "full_text": "The zero-trust security model assumes that no user or device should be trusted by default, regardless of their location. This paper presents a comprehensive framework for implementing zero-trust architecture. We discuss key principles including identity verification, least-privilege access, and continuous monitoring. The framework includes components for identity and access management, network segmentation, and security analytics. Implementation challenges and solutions are discussed, including integration with existing systems and user experience considerations. Case studies from organizations that have adopted zero-trust models demonstrate improved security posture and reduced attack surface. The paper also addresses cost-benefit analysis and provides guidance for organizations considering zero-trust adoption."
            },
            
            # Data Science Papers
            {
                "title": "Big Data Analytics: Techniques and Applications",
                "authors": ["Rachel Adams", "Steven Lee", "Tina Brown"],
                "publication_year": 2023,
                "subject": "Data Science",
                "summary": "A comprehensive overview of big data analytics techniques and their applications across various industries.",
                "full_text": "Big data analytics has become essential for organizations seeking to extract value from large and complex datasets. This paper surveys key techniques including distributed computing frameworks, stream processing, and data mining algorithms. We examine popular tools and platforms such as Hadoop, Spark, and Kafka, analyzing their strengths and limitations. Case studies from retail, healthcare, and finance demonstrate real-world applications of big data analytics. The paper also discusses challenges including data quality, privacy concerns, and scalability issues. We propose best practices for big data projects, including data governance frameworks and architectural patterns. The integration of machine learning with big data analytics is explored, showing how predictive models can be deployed at scale."
            },
            {
                "title": "Data Visualization for Business Intelligence",
                "authors": ["Victor Chen", "Wendy Martinez"],
                "publication_year": 2024,
                "subject": "Data Science",
                "summary": "This study explores effective data visualization techniques for business intelligence and decision-making.",
                "full_text": "Effective data visualization is crucial for communicating insights and supporting data-driven decision-making. This paper presents principles and best practices for creating informative and engaging visualizations. We discuss various chart types and their appropriate use cases, considering factors such as data characteristics and audience needs. Interactive dashboards enable users to explore data and discover patterns. The paper examines tools and frameworks for creating visualizations, including D3.js, Tableau, and Power BI. Case studies demonstrate how well-designed visualizations have improved business outcomes. We also address accessibility considerations and techniques for making visualizations usable by people with disabilities. The integration of storytelling with data visualization is explored as a means to enhance communication effectiveness."
            },
            
            # Cloud Computing Papers
            {
                "title": "Cloud-Native Architecture: Design Patterns and Best Practices",
                "authors": ["Xavier Rodriguez", "Yuki Tanaka"],
                "publication_year": 2023,
                "subject": "Cloud Computing",
                "summary": "An examination of cloud-native architecture patterns and their implementation in modern applications.",
                "full_text": "Cloud-native architecture enables organizations to build scalable, resilient, and efficient applications. This paper presents key design patterns including microservices, containerization, and serverless computing. We discuss container orchestration platforms such as Kubernetes and their role in managing cloud-native applications. The paper examines service mesh technologies that provide advanced networking capabilities for microservices. Best practices for designing cloud-native systems are presented, including considerations for scalability, reliability, and cost optimization. Case studies from organizations that have successfully adopted cloud-native architectures demonstrate benefits and challenges. We also address security considerations and compliance requirements in cloud environments. The paper concludes with guidance on migration strategies for legacy applications."
            },
            {
                "title": "Serverless Computing: Performance and Cost Analysis",
                "authors": ["Zoe Anderson", "Alex Kim"],
                "publication_year": 2024,
                "subject": "Cloud Computing",
                "summary": "This research analyzes the performance characteristics and cost implications of serverless computing platforms.",
                "full_text": "Serverless computing has gained popularity as a cost-effective and scalable approach to application deployment. This paper presents a comprehensive analysis of serverless platforms, examining performance characteristics, pricing models, and use cases. We conduct benchmarks comparing serverless functions with traditional virtual machines, analyzing factors such as cold start latency and execution time. Cost analysis reveals scenarios where serverless computing provides significant savings, as well as cases where traditional approaches may be more economical. The paper discusses optimization techniques for improving serverless function performance and reducing costs. Case studies demonstrate real-world applications of serverless computing, including web APIs, data processing pipelines, and event-driven architectures. We also address limitations and challenges, proposing solutions for common issues."
            },
            
            # Software Engineering Papers
            {
                "title": "Agile Software Development: Practices and Outcomes",
                "authors": ["Brian Wilson", "Catherine Lee", "Daniel Park"],
                "publication_year": 2023,
                "subject": "Software Engineering",
                "summary": "A study of agile development practices and their impact on software quality and team productivity.",
                "full_text": "Agile software development has become the dominant methodology in the software industry. This paper examines various agile practices including Scrum, Kanban, and Extreme Programming. We analyze the impact of agile practices on software quality, team productivity, and customer satisfaction. Empirical studies reveal both benefits and challenges of agile adoption. The paper discusses factors that contribute to successful agile implementations, including team composition, organizational culture, and tooling support. Case studies from different organizations provide insights into agile transformation journeys. We also explore scaling agile practices for large organizations and distributed teams. The integration of DevOps practices with agile methodologies is examined, showing how continuous integration and deployment enhance agile workflows."
            },
            {
                "title": "Code Review Practices: Impact on Software Quality",
                "authors": ["Emma White", "Frank Johnson"],
                "publication_year": 2024,
                "subject": "Software Engineering",
                "summary": "This research investigates code review practices and their effectiveness in improving software quality.",
                "full_text": "Code review is a critical practice in software development that helps identify defects, share knowledge, and maintain code quality. This paper presents a comprehensive analysis of code review practices, examining factors such as review size, reviewer selection, and review tools. We analyze data from open-source projects to understand patterns in code review effectiveness. The study reveals that smaller, focused reviews tend to be more effective at finding defects. Reviewer expertise and diversity also impact review quality. The paper discusses automated code review tools and their role in complementing human reviewers. Best practices for conducting effective code reviews are presented, including guidelines for reviewers and authors. We also address challenges such as review bottlenecks and reviewer fatigue, proposing solutions to improve the review process."
            },
            
            # Artificial Intelligence Papers
            {
                "title": "Explainable AI: Methods and Applications",
                "authors": ["Gina Martinez", "Hiroshi Yamamoto"],
                "publication_year": 2023,
                "subject": "Artificial Intelligence",
                "summary": "An exploration of explainable AI techniques that make machine learning models more interpretable and trustworthy.",
                "full_text": "As AI systems are deployed in critical applications, the need for explainability has become paramount. This paper surveys explainable AI techniques including feature importance methods, attention mechanisms, and model-agnostic approaches. We discuss the trade-offs between model accuracy and interpretability, examining various methods for achieving both. Case studies in healthcare, finance, and criminal justice demonstrate the importance of explainable AI. The paper also addresses regulatory requirements and ethical considerations related to AI explainability. We propose frameworks for evaluating explanation quality and user trust. The integration of explainability into the machine learning pipeline is discussed, showing how explanations can be generated during model development and deployment."
            },
            {
                "title": "AI Ethics: Bias, Fairness, and Accountability",
                "authors": ["Ivan Petrov", "Jessica Taylor"],
                "publication_year": 2024,
                "subject": "Artificial Intelligence",
                "summary": "This paper examines ethical issues in AI systems, focusing on bias, fairness, and mechanisms for accountability.",
                "full_text": "AI systems can perpetuate and amplify societal biases, leading to unfair outcomes. This paper examines sources of bias in AI systems, including biased training data, algorithmic bias, and deployment bias. We discuss fairness metrics and techniques for measuring and mitigating bias. The paper presents methods for achieving fairness in machine learning, including pre-processing, in-processing, and post-processing approaches. Case studies illustrate real-world examples of AI bias and their consequences. We also address accountability mechanisms, including audit trails, impact assessments, and governance frameworks. The role of diverse teams in developing fair AI systems is emphasized. The paper concludes with recommendations for organizations developing and deploying AI systems."
            }
        ]

        for paper_data in sample_papers:
            title = paper_data["title"]
            short_text = paper_data["full_text"]
            long_text = get_long_full_text(title) if get_long_full_text else None
            full_text = long_text if long_text is not None else _expand_full_text(short_text, 1200)

            existing = db.query(Paper).filter(Paper.title == title).first()
            if not existing:
                # Seed papers are assigned to user 1 so the first user has a starter library
                db_paper = Paper(
                    owner_id=1,
                    title=title,
                    authors=json.dumps(paper_data["authors"]),
                    publication_year=paper_data["publication_year"],
                    subject=paper_data["subject"],
                    summary=paper_data["summary"],
                    full_text=full_text,
                )
                db.add(db_paper)
        
        db.commit()
        final_count = db.query(Paper).count()
        print(f"Successfully seeded papers. Total papers in database: {final_count}")
    except Exception as e:
        db.rollback()
        print(f"Error seeding papers: {e}")
        raise
    finally:
        db.close()

if __name__ == "__main__":
    seed_papers()
