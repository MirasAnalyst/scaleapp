import Image from 'next/image';
import Header from 'components/Header';
import Footer from 'components/Footer';
import { Users, ExternalLink } from 'lucide-react';

/* ---------- tiny inline company logos ---------- */

function MetaLogo({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 190" className={className} aria-label="Meta">
      <defs>
        <linearGradient id="mg1" x1="61" y1="117" x2="259" y2="127" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0064e1" offset="0" /><stop stopColor="#0082fb" offset="1" />
        </linearGradient>
        <linearGradient id="mg2" x1="45" y1="139" x2="45" y2="66" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0082fb" offset="0" /><stop stopColor="#0064e0" offset="1" />
        </linearGradient>
      </defs>
      <path fill="#0081fb" d="m31,126c0,11 2.4,19.4 5.6,24.5 4.1,6.7 10.3,9.5 16.6,9.5 8.1,0 15.5-2 29.8-21.8 11.4-15.8 24.9-38 34-52l15.4-23.6c10.7-16.4 23-34.6 37.2-47 11.6-10 24-15.7 36.6-15.7 21,0 41.1,12.2 56.5,35.1 16.8,25.1 25,56.7 25,89.3 0,19.4-3.8,33.6-10.3,44.9-6.3,10.9-18.5,21.8-39.1,21.8v-31c17.6,0 22-16.2 22-34.7 0-26.4-6.2-55.7-19.7-76.7-9.6-14.9-22.1-23.9-35.8-23.9-14.9,0-26.8,11.2-40.2,31.2-7.1,10.6-14.5,23.5-22.7,38.1l-9.1,16c-18.2,32.3-22.8,39.6-31.9,51.8-16,21.2-29.6,29.3-47.5,29.3-21.3,0-34.7-9.2-43-23.1C3.3,157.1,0,142.3,0,125.4z" />
      <path fill="url(#mg1)" d="m24.5,37.3c14.2-22 34.8-37.3 58.4-37.3 13.6,0 27.2,4 41.4,15.6 15.5,12.7 32,33.5 52.6,67.8l7.4,12.3c17.8,29.7 28,45 33.9,52.2 7.6,9.3 13,12 19.9,12 17.6,0 22-16.2 22-34.7l27.4-.9c0,19.4-3.8,33.6-10.3,44.9-6.3,10.9-18.5,21.8-39.1,21.8-12.8,0-24.1-2.8-36.7-14.6-9.6-9.1-20.9-25.2-29.6-39.7l-25.8-43.1c-12.9-21.6-24.8-37.7-31.7-45-7.4-7.9-16.9-17.3-32-17.3-12.3,0-22.7,8.6-31.4,21.8z" />
      <path fill="url(#mg2)" d="m82.4,31.2c-12.3,0-22.7,8.6-31.4,21.8C38.7,71.6,31.1,99.3,31.1,126c0,11 2.4,19.4 5.6,24.5L10.2,168c-6.8-11.3-10.1-26.2-10.1-43.1 0-30.8 8.4-62.8 24.5-87.6C38.8,15.4 59.3,0 82.9,0z" />
    </svg>
  );
}

function MDPILogo({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 28" className={className} aria-label="MDPI">
      <text x="0" y="22" fontFamily="Arial,Helvetica,sans-serif" fontWeight="700" fontSize="24" fill="#0752C5">MDPI</text>
    </svg>
  );
}

function MonumentLabsLogo({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 24" className={className} aria-label="Monument Labs">
      <rect x="8" y="0" width="4" height="24" rx="2" fill="#3B82F6" />
    </svg>
  );
}

/* ---------- team data ---------- */

type Bullet =
  | { text: string; href?: string; logo?: React.ReactNode }

const team: {
  name: string;
  role: string;
  photo: string;
  linkedin: string;
  bullets: Bullet[];
}[] = [
  {
    name: 'Miras Muratov',
    role: 'CEO & Founder',
    photo: '/team/miras.png',
    linkedin: 'https://www.linkedin.com/in/miras-muratov-7535741b3/',
    bullets: [
      { text: 'Ex-Chevron Process Engineer', logo: <Image src="/products/Chevron_Logo.svg.png" alt="Chevron" width={24} height={24} className="w-6 h-6 shrink-0 object-contain" /> },
      { text: 'Published researcher in chemical process optimization', href: 'https://doi.org/10.3390/molecules29225302', logo: <MDPILogo className="w-10 h-4 shrink-0" /> },
      { text: 'Ex-Data Scientist at Monument Labs', href: 'https://www.monumentlabs.io/', logo: <MonumentLabsLogo className="w-4 h-5 shrink-0" /> },
      { text: 'MSc in Chemical Engineering & Data Science' },
    ],
  },
  {
    name: 'Kyle Johnson',
    role: 'Technical Advisor',
    photo: '/team/kyle.jpeg',
    linkedin: 'https://www.linkedin.com/in/gkjohns/',
    bullets: [
      { text: 'Ex-Meta Senior Data Scientist', logo: <MetaLogo className="w-6 h-4 shrink-0" /> },
      { text: 'Founder of AI startups (Monument Labs, Margin, Ara, Riff, CallCompass)', href: 'https://www.monumentlabs.io/', logo: <MonumentLabsLogo className="w-4 h-5 shrink-0" /> },
    ],
  },
];

/* ---------- page ---------- */

export default function AboutPage() {
  return (
    <div className="flex flex-col min-h-screen bg-white dark:bg-gray-950">
      <Header />

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden bg-white dark:bg-gray-950 pt-32 lg:pt-40 pb-20">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />

          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto">
              <div className="inline-flex items-center px-3 py-1 rounded-full border border-gray-300 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-400 mb-6">
                <Users className="w-4 h-4 mr-2" />
                About Us
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 dark:text-white mb-6 leading-[1.1]">
                Meet the{' '}
                <span className="text-blue-600">team</span>
              </h1>

              <p className="text-lg text-gray-600 dark:text-gray-400 mb-8 max-w-2xl mx-auto leading-relaxed">
                Engineers and data scientists building AI-powered tools for the process industry.
              </p>
            </div>
          </div>
        </section>

        {/* Team */}
        <section className="py-20 bg-white dark:bg-gray-950">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {team.map((member) => (
                <div
                  key={member.name}
                  className="rounded-2xl border border-gray-200 dark:border-gray-800 p-8 flex flex-col items-center text-center"
                >
                  {/* Photo */}
                  <div className="relative w-32 h-32 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-800 mb-5">
                    <Image
                      src={member.photo}
                      alt={member.name}
                      fill
                      className="object-cover"
                    />
                  </div>

                  {/* Name + role */}
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-1.5">
                    {member.name}
                    <a
                      href={member.linkedin}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gray-400 hover:text-blue-600 transition-colors"
                      aria-label={`${member.name} LinkedIn`}
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </h3>
                  <p className="text-sm text-blue-600 font-medium mb-4">{member.role}</p>

                  {/* Bullets */}
                  <ul className="space-y-3 text-sm text-gray-600 dark:text-gray-400 text-left w-full">
                    {member.bullets.map((item, i) => (
                      <li key={i} className="flex items-center gap-2.5">
                        <span className="w-6 h-6 shrink-0 flex items-center justify-center">
                          {item.logo ?? (
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                          )}
                        </span>
                        {item.href ? (
                          <a
                            href={item.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors underline underline-offset-2"
                          >
                            {item.text}
                          </a>
                        ) : (
                          <span>{item.text}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
