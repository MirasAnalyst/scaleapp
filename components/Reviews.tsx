import Review from "./Review";

interface ReviewData {
  rating: number;
  title: string;
  content: string;
  author: string;
  designation: string;
}

interface ReviewsProps {
  reviews?: ReviewData[];
}

const defaultReviews: ReviewData[] = [
  {
    rating: 5,
    title: "A real game-changer for process engineers!",
    content:
      "This tool cut my simulation setup time by more than half. Instead of spending days configuring Aspen HYSYS, I can now generate a complete flowsheet in minutes. It feels like having a senior engineer guiding me step by step.",
    author: "Elena Petrova",
    designation: "Process Engineer",
  },
  {
    rating: 5,
    title: "Finally, CAD work without the pain.",
    content:
      "As a design engineer, I spend countless hours in AutoCAD. With this app, I can go from a rough idea to a detailed building layout in no time. It bridges the gap between concept and execution better than anything I've tried.",
    author: "Rahul Mehta",
    designation: "Design Engineer",
  },
  {
    rating: 5,
    title: "Seamless for automation workflows.",
    content:
      "Integrating P&IDs with automation systems used to be a nightmare. Now, I can auto-generate diagrams and quickly validate control strategies without manual rework. This is the future of engineering tools.",
    author: "Lucas Fernandez",
    designation: "Automation Engineer",
  },
  {
    rating: 5,
    title: "Transforms the way I teach chemical engineering.",
    content:
      "My students struggle with Aspen and AutoCAD because of the steep learning curve. This platform levels the playing field—it lets them practice like professionals from day one. An invaluable teaching companion.",
    author: "Dr. Maria Svensson",
    designation: "Professor of Chemical Engineering",
  },
];

const Reviews: React.FC<ReviewsProps> = ({ reviews = defaultReviews }) => {
  return (
    <section className="py-24 bg-gradient-to-br from-gray-50 via-white to-blue-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <div className="inline-flex items-center px-4 py-2 rounded-full bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 text-sm font-medium mb-6">
            <span className="text-yellow-500 mr-2">⭐⭐⭐⭐⭐</span>
            Customer Reviews
          </div>
          <h2 className="text-4xl sm:text-5xl md:text-6xl font-bold text-gray-900 dark:text-white mb-6">
            What Engineers Are Saying
          </h2>
          <p className="text-xl text-gray-600 dark:text-gray-400 max-w-3xl mx-auto">
            Don&apos;t just take our word for it. Here&apos;s what industry professionals are saying about our platform.
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-6xl mx-auto">
          {reviews.map((review, index) => (
            <div key={index} className="group">
              <Review {...review} />
            </div>
          ))}
        </div>

        {/* Trust Indicators */}
        <div className="text-center mt-16">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-lg border border-gray-100 dark:border-gray-700">
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              Join the Engineering Revolution
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Over 10,000 engineers trust our platform to accelerate their design process
            </p>
            <div className="flex flex-wrap justify-center items-center gap-8 text-sm text-gray-500 dark:text-gray-400">
              <div className="flex items-center">
                <span className="font-semibold text-gray-900 dark:text-white mr-2">4.9/5</span>
                Average Rating
              </div>
              <div className="flex items-center">
                <span className="font-semibold text-gray-900 dark:text-white mr-2">10,000+</span>
                Active Users
              </div>
              <div className="flex items-center">
                <span className="font-semibold text-gray-900 dark:text-white mr-2">95%</span>
                Time Saved
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Reviews;
