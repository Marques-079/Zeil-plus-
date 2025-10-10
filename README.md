# 💼 EasyHire — AI CV Checker

**Built By:**

**Joshua Li: Full Stack Developer**

**Marcus Chan: Full Stack Developer**

**Our Video Submission:**

[Video Submission](https://www.youtube.com/watch?v=ZPsLlhV16Cw)


**Our Slide Deck:**
[Click Here]([url](https://www.canva.com/design/DAG1WSHUjGE/8tZAk9p00XlVeN2JjhrZTA/view?utm_content=DAG1WSHUjGE&utm_campaign=designshare&utm_medium=link2&utm_source=uniquelinks&utlId=h90401cf751))


ACCESS TO PAGES:

Audio Language Test: http://localhost:3000/tts

Dashboard Page: http://localhost:3000/cv-score

Main Page: http://localhost:3000/




A modern, elegant web app built for the **ZEIL Hackathon**.  
EasyHire lets recruiters **upload and analyze CVs** instantly, scoring them and displaying results in a smooth, animated dashboard.

Built with:
- ⚡ **Next.js 15**
- 🎨 **Tailwind CSS + shadcn/ui**
- 💫 **Framer Motion**
- 🧠 **TypeScript / JavaScript**
- 💜 **ZEIL-inspired design theme**

---

## 🚀 Features

### 🧠 CV Intelligence Scoring  
Each uploaded **PDF résumé** is parsed and compared against a **large language model (LLM)** that evaluates structure, relevance, and clarity.  
The system then analyzes **semantic similarity** between the candidate’s CV and a target **job description**, detecting keyword density, contextual alignment, and industry-specific phrasing.

### ⚖️ Weighted Scoring Engine  
Outputs a **weighted average score** that balances **semantic matching** (meaning-based alignment) and **keyword precision** (relevant term presence).  
This ensures fair, data-driven ranking across diverse candidate profiles.

### 🗣️ English Speaking Test  
After CV evaluation, users record themselves reading a short **prompt sentence**.  
The system compares the recording to a **model reference**, analyzing:
- **Pacing**
- **Pronunciation accuracy**
- **Spoken word fidelity**  

using advanced **audio signal processing** and **speech recognition models**.

### 📊 Comprehensive Candidate Profile  
Results are aggregated into an **AI-generated evaluation**, summarizing both:
- **Written communication strength** (via CV)
- **Spoken proficiency** (via English test)  

providing a holistic, automated view of candidate suitability.

---

✅ Upload and analyze CVs in seconds  
✅ Animated dashboard showing:
- Total CVs uploaded  
- Average score  
- Top 5 highest scores  
✅ Paginated and searchable CV list (alphabetical order)  
✅ Sort by score or date (ascending / descending)  
✅ Fully responsive and modern UI with shadcn components  
✅ Smooth Framer Motion animations  

---

## 🧩 Tech Stack

| Technology | Purpose |
|-------------|----------|
| **Next.js 15** | React-based frontend framework |
| **Tailwind CSS** | Styling and layout |
| **shadcn/ui** | UI components (Button, Input, Card, Table, etc.) |
| **Framer Motion** | Smooth UI animations |
| **Lucide React** | Icon set |
| **TypeScript / JavaScript** | Core logic |

---

## 🛠️ Getting Started
yarn install
or 
npm install

## shadcn Install
npx shadcn@latest init

# add required components
npx shadcn@latest add button input card table pagination

# install supporting libraries
yarn add framer-motion lucide-react class-variance-authority tailwind-variants

### 1️⃣ Clone the repository
```bash
git clone <your-repo-url>
cd <your-project-folder>

