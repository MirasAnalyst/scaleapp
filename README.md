# Free Next JS Starter Template

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?demo-description=A%20minimal%20Next.js%20template%20for%20building%20SaaS%20websites%20with%20only%20the%20essential%20dependencies.&demo-image=%2F%2Fimages.ctfassets.net%2Fe5382hct74si%2F7guUYce8M9UWWL2id1Out%2F432b98af389e3b9605804849a726a258%2Fsaas.png&demo-title=Minimal%20Next.js%20SaaS%20Website%20Starter&demo-url=https%3A%2F%2Fnextjs-saas-starter-template.vercel.app%2F&from=templates&project-name=Minimal%20Next.js%20SaaS%20Website%20Starter&repository-name=next-js-saas-website-starter&repository-url=https%3A%2F%2Fgithub.com%2Ftalhatahir%2Fnextjs-saas-starter-template&skippable-integrations=1)

This is a starter template for a SaaS application built with Next.js. It uses the minimum amount of dependencies and tools to get you started.
Tailwind CSS is used for styling, and Next Themes is used for dark mode. React Icons is used for icons.

<img width="1525" alt="image" src="https://github.com/user-attachments/assets/68db6585-3807-49c0-89fc-7a298c2abb02">

### How to use

1. Clone the repository
2. Install dependencies `npm install`
3. Run the development server `npm run dev`

### Features

- Next.js 14 with app router
- Prebuilt components for a quick start
- Tailwind CSS
- Next Themes for dark mode
- React Icons

## Rocket CAD Pipeline

The `/autocad/mechanical` route now generates rocket-grade CAD deliverables. The flow combines:

- A strict `RocketSpec` Zod schema (`types/rocket.ts`) and OpenAI function-calling helper (`lib/openai.ts`) that returns validated JSON.
- A BullMQ queue (`lib/queue/rocket-queue.ts`) plus worker (`workers/rocketWorker.ts`) that forwards specs to the FastAPI CAD microservice.
- A Python CAD stack (`cad_worker/`) using CadQuery + FreeCAD TechDraw + ezdxf to output STEP, DXF, and PDF files along with sanity checks.

Refer to `docs/rocket-cad-pipeline.md` for setup instructions, Docker Compose usage, environment variables, and the end-to-end test. Drafting standards and LLM guidance live at `docs/rocket-design-rules.md`.

[!["Buy Me A Coffee"](https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png)](https://www.buymeacoffee.com/talhatahir)
