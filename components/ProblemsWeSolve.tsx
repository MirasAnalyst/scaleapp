import { AlertTriangle, Clock, DollarSign, Users, ArrowRight } from "lucide-react";

export default function ProblemsWeSolve() {
  const problems = [
    {
      icon: Users,
      title: "Expertise Barrier",
      description: "Until now, only seasoned engineers could run simulations or create accurate flowsheets and diagrams in Aspen, AutoCAD, and similar tools. We make this expertise available to everyone.",
      color: "text-blue-600 dark:text-blue-400",
      bgColor: "bg-blue-100 dark:bg-blue-900",
      gradient: "from-blue-500 to-blue-600",
    },
    {
      icon: Clock,
      title: "From Idea to Execution",
      description: "Scaling a concept into a detailed process or building design usually takes weeks. Our AI does it in minutes.",
      color: "text-green-600 dark:text-green-400",
      bgColor: "bg-green-100 dark:bg-green-900",
      gradient: "from-green-500 to-green-600",
    },
    {
      icon: AlertTriangle,
      title: "Time-Consuming Setup",
      description: "Building flowsheets, P&IDs, and diagrams can take hours or even days.",
      color: "text-orange-600 dark:text-orange-400",
      bgColor: "bg-orange-100 dark:bg-orange-900",
      gradient: "from-orange-500 to-orange-600",
    },
    {
      icon: DollarSign,
      title: "Costly Errors",
      description: "Manual design increases the risk of mistakes that cascade into bigger problems.",
      color: "text-red-600 dark:text-red-400",
      bgColor: "bg-red-100 dark:bg-red-900",
      gradient: "from-red-500 to-red-600",
    },
  ];

  return (
    <section className="py-24 bg-gradient-to-br from-gray-50 via-white to-blue-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <div className="container mx-auto px-4">
        <div className="text-center mb-20">
          <div className="inline-flex items-center px-4 py-2 rounded-full bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 text-sm font-medium mb-6">
            <AlertTriangle className="w-4 h-4 mr-2" />
            Industry Challenges
          </div>
          <h2 className="text-4xl sm:text-5xl md:text-6xl font-bold text-gray-900 dark:text-white mb-6">
            Problems We Solve
          </h2>
          <p className="text-xl text-gray-600 dark:text-gray-400 max-w-3xl mx-auto leading-relaxed">
            We address the key challenges that engineers and designers face in engineering and design workflows, 
            transforming pain points into competitive advantages.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-7xl mx-auto">
          {problems.map((problem, index) => {
            const IconComponent = problem.icon;
            return (
              <div
                key={index}
                className="group relative bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-lg hover:shadow-2xl transition-all duration-500 hover:-translate-y-2 border border-gray-100 dark:border-gray-700"
              >
                {/* Gradient Border Effect */}
                <div className={`absolute inset-0 rounded-2xl bg-gradient-to-r ${problem.gradient} opacity-0 group-hover:opacity-10 transition-opacity duration-500`}></div>
                
                <div className="relative">
                  <div className="flex items-start space-x-6">
                    <div className={`p-4 rounded-2xl ${problem.bgColor} group-hover:scale-110 transition-transform duration-300`}>
                      <IconComponent className={`w-8 h-8 ${problem.color}`} />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-4 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                        {problem.title}
                      </h3>
                      <p className="text-gray-600 dark:text-gray-400 leading-relaxed text-lg">
                        {problem.description}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom CTA */}
        <div className="text-center mt-16">
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl p-8 text-white">
            <h3 className="text-2xl font-bold mb-4">
              Ready to Solve These Challenges?
            </h3>
            <p className="text-lg mb-6 opacity-90">
              Join thousands of engineers who have already transformed their workflow.
            </p>
            <a
              href="/builder"
              className="inline-flex items-center space-x-2 bg-white text-blue-600 px-8 py-3 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
            >
              <span>Start Free Trial</span>
              <ArrowRight className="w-5 h-5" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
