import Header from "components/Header";
import Hero from "components/Hero";
import LogoBar from "components/LogoBar";
import BentoFeatures from "components/BentoFeatures";
import Footer from "components/Footer";
import Reviews from "components/Reviews";
import GetStarted from "components/GetStarted";

export default function Page() {
  return (
    <div className="flex flex-col min-h-screen bg-white dark:bg-gray-950">
      <Header />
      <main>
        <Hero />
        <LogoBar />
        <BentoFeatures />
        <Reviews />
        <GetStarted />
      </main>
      <Footer />
    </div>
  );
}
