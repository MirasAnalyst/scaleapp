/* eslint-disable @next/next/no-img-element */

const companies = [
  {
    name: 'ExxonMobil',
    logo: (
      <svg viewBox="0 0 200 28" className="h-10 w-auto" aria-label="ExxonMobil">
        <text x="0" y="22" fontFamily="Arial,Helvetica,sans-serif" fontWeight="700" fontSize="25" letterSpacing="-0.5">
          <tspan fill="#FF0000">E</tspan>
          <tspan fill="#FF0000">x</tspan>
          <tspan fill="#FF0000">x</tspan>
          <tspan fill="#FF0000">on</tspan>
          <tspan fill="#0051A5">M</tspan>
          <tspan fill="#0051A5">o</tspan>
          <tspan fill="#0051A5">b</tspan>
          <tspan fill="#0051A5">i</tspan>
          <tspan fill="#0051A5">l</tspan>
        </text>
      </svg>
    ),
  },
  {
    name: 'Shell',
    logo: (
      <img src="/logos/shell.svg" alt="Shell" className="h-14 w-auto" />
    ),
  },
  {
    name: 'BASF',
    logo: (
      <svg viewBox="0 0 110 30" className="h-8 w-auto" aria-label="BASF">
        <rect x="0" y="0" width="110" height="30" rx="2" fill="#004F9E" />
        <text x="55" y="22" fontFamily="Arial,Helvetica,sans-serif" fontWeight="700" fontSize="22" fill="white" textAnchor="middle" letterSpacing="3">BASF</text>
      </svg>
    ),
  },
  {
    name: 'Dow',
    logo: (
      <img src="/logos/DOW-logo.svg" alt="Dow" className="h-10 w-auto" />
    ),
  },
  {
    name: 'Chevron',
    logo: (
      <img src="/products/Chevron_Logo.svg.png" alt="Chevron" className="h-14 w-auto object-contain" />
    ),
  },
];

export default function LogoBar() {
  return (
    <section className="border-y border-gray-200 dark:border-gray-800 py-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <p className="text-xs uppercase tracking-widest text-gray-400 dark:text-gray-500 text-center mb-8">
          Trusted by engineers at leading companies
        </p>
        <div className="grid grid-cols-5 gap-16 items-center max-w-6xl mx-auto">
          {companies.map((company) => (
            <div
              key={company.name}
              className="flex items-center justify-center"
            >
              {company.logo}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
