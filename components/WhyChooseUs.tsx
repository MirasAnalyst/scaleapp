import { 
  Target, 
  Zap, 
  Building2, 
  GitBranch, 
  MessageCircle,
  CheckCircle,
  ArrowRight,
  TrendingUp
} from "lucide-react";

export default function WhyChooseUs() {
  const features = [
    {
      icon: TrendingUp,
      title: "Empowers users to iterate processes, optimize industry performance, and increase production",
      description: "Transform your operations with AI-driven insights that help you continuously improve processes, enhance efficiency, and boost productivity across your entire facility.",
      color: "text-orange-600 dark:text-orange-400",
      bgColor: "bg-orange-100 dark:bg-orange-900",
    },
    {
      icon: Target,
      title: "Engineer-Level Precision Without Years of Training",
      description: "Skip years of training. Our AI assistant helps you run simulations, build flowsheets, and create CAD/P&ID diagrams with expert-level precision.",
      color: "text-blue-600 dark:text-blue-400",
      bgColor: "bg-blue-100 dark:bg-blue-900",
    },
    {
      icon: Zap,
      title: "Flowsheets in Seconds",
      description: "Describe your process—our AI instantly builds flowsheets for oil, gas, chemical, and industrial plants.",
      color: "text-yellow-600 dark:text-yellow-400",
      bgColor: "bg-yellow-100 dark:bg-yellow-900",
    },
    {
      icon: Building2,
      title: "AutoCAD & Building Diagrams",
      description: "Scale up your plant or building layout in 2D/3D with AutoCAD-ready outputs.",
      color: "text-green-600 dark:text-green-400",
      bgColor: "bg-green-100 dark:bg-green-900",
    },
    {
      icon: GitBranch,
      title: "P&ID Automation",
      description: "Generate piping & instrumentation diagrams directly from natural language instructions.",
      color: "text-purple-600 dark:text-purple-400",
      bgColor: "bg-purple-100 dark:bg-purple-900",
    },
    {
      icon: MessageCircle,
      title: "Interactive AI Assistant",
      description: "Ask \"How do I add a compressor after the separator?\" or \"Design a column for ethanol-water separation.\" Get instant answers grounded in industry standards.",
      color: "text-indigo-600 dark:text-indigo-400",
      bgColor: "bg-indigo-100 dark:bg-indigo-900",
    },
  ];

  return (
    <section className="py-24 bg-gradient-to-br from-white via-blue-50 to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <div className="container mx-auto px-4">
        <div className="text-center mb-20">
          <div className="inline-flex items-center px-4 py-2 rounded-full bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 text-sm font-medium mb-6">
            <Target className="w-4 h-4 mr-2" />
            Our Advantages
          </div>
          <h2 className="text-4xl sm:text-5xl md:text-6xl font-bold text-gray-900 dark:text-white mb-6">
            Why Choose Us
          </h2>
          <p className="text-xl text-gray-600 dark:text-gray-400 max-w-3xl mx-auto leading-relaxed">
            Transform your engineering workflow with AI-powered precision and speed. 
            <span className="font-semibold text-gray-900 dark:text-white"> Experience the future of engineering design.</span>
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-7xl mx-auto mb-16">
          {features.map((feature, index) => {
            const IconComponent = feature.icon;
            return (
              <div
                key={index}
                className="group relative bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-lg hover:shadow-2xl transition-all duration-500 hover:-translate-y-2 border border-gray-100 dark:border-gray-700"
              >
                {/* Gradient Border Effect */}
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-blue-500/10 to-purple-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                
                <div className="relative">
                  <div className="flex flex-col items-center text-center">
                    <div className={`p-5 rounded-2xl ${feature.bgColor} mb-6 group-hover:scale-110 transition-transform duration-300`}>
                      <IconComponent className={`w-10 h-10 ${feature.color}`} />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4 leading-tight group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                      {feature.title}
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                      {feature.description}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Enhanced Call to Action */}
        <div className="text-center">
          <div className="relative bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 rounded-3xl p-12 text-white overflow-hidden">
            {/* Background Pattern */}
            <div className="absolute inset-0 bg-grid-pattern opacity-10"></div>
            
            <div className="relative">
              <h3 className="text-3xl sm:text-4xl font-bold mb-6">
                Ready to Transform Your Engineering Workflow?
              </h3>
              <p className="text-xl mb-8 opacity-90 max-w-2xl mx-auto">
                Join thousands of engineers who are already building better, faster, and more accurately. 
                Start your free trial today.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                <a
                  href="/builder"
                  className="group inline-flex items-center space-x-2 bg-white text-blue-600 px-8 py-4 rounded-lg font-semibold hover:bg-gray-100 transition-all duration-300 hover:scale-105 shadow-lg"
                >
                  <Zap className="w-5 h-5" />
                  <span>Start Building Now</span>
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </a>
                <button className="group inline-flex items-center space-x-2 bg-transparent border-2 border-white text-white px-8 py-4 rounded-lg font-semibold hover:bg-white hover:text-blue-600 transition-all duration-300 hover:scale-105">
                  <span>Schedule Demo</span>
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
