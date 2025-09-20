import Header from "components/Header";
import Hero from "components/Hero";
import ProblemsWeSolve from "components/ProblemsWeSolve";
import WhyChooseUs from "components/WhyChooseUs";
import Footer from "components/Footer";
import Reviews from "components/Reviews";
import GetStarted from "components/GetStarted";

export default function Page() {
  return (
    <div className="flex flex-col min-h-screen bg-white dark:bg-black">
      <Header />
      <main>
        <Hero />
        <ProblemsWeSolve />
        <WhyChooseUs />
        <Reviews />
        <GetStarted />
      </main>
      <Footer />
    </div>
  );
}
