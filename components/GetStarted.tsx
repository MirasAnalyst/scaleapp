import { ArrowRight, Zap, Users, Clock } from "lucide-react";

export default function GetStarted() {
  return (
    <section className="py-20 bg-gradient-to-br from-blue-600 via-purple-600 to-indigo-700">
      <div className="container mx-auto px-4">
        <div className="text-center text-white">
          {/* Main Content */}
          <div className="max-w-4xl mx-auto mb-12">
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-6">
              Join engineers and innovators who are scaling concepts into reality with AI
            </h2>
            <p className="text-xl sm:text-2xl mb-8 opacity-90 leading-relaxed">
              Build flowsheets, P&IDs, and building diagrams in minutes—not weeks. Start with 5 free designs today.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-12">
            <a
              href="/builder"
              className="group flex items-center space-x-2 bg-white text-blue-600 px-8 py-4 rounded-lg font-semibold text-lg hover:bg-gray-100 transition-all duration-300 hover:scale-105 shadow-lg"
            >
              <span>Get Started</span>
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </a>
            <a
              href="/login"
              className="group flex items-center space-x-2 bg-transparent border-2 border-white text-white px-8 py-4 rounded-lg font-semibold text-lg hover:bg-white hover:text-blue-600 transition-all duration-300 hover:scale-105"
            >
              <span>Log In</span>
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </a>
          </div>

          {/* Feature Highlights */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            <div className="flex flex-col items-center text-center">
              <div className="bg-white bg-opacity-20 p-4 rounded-full mb-4">
                <Zap className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Lightning Fast</h3>
              <p className="text-sm opacity-80">Generate professional diagrams in minutes, not hours</p>
            </div>
            <div className="flex flex-col items-center text-center">
              <div className="bg-white bg-opacity-20 p-4 rounded-full mb-4">
                <Users className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Trusted by Engineers</h3>
              <p className="text-sm opacity-80">Join thousands of professionals worldwide</p>
            </div>
            <div className="flex flex-col items-center text-center">
              <div className="bg-white bg-opacity-20 p-4 rounded-full mb-4">
                <Clock className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-lg font-semibold mb-2">5 Free Designs</h3>
              <p className="text-sm opacity-80">Start building immediately with no commitment</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
