import Review from "./Review";

interface ReviewData {
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
    title: "A real game-changer for process engineers!",
    content:
      "I used to spend days configuring HYSYS—now I generate a complete flowsheet in minutes and my setup time dropped by more than half.",
    author: "Elena Petrova",
    designation: "Process Engineer",
  },
  {
    title: "From concept to flowsheet in minutes.",
    content:
      "I went from spending hours on simulation setup to turning a rough concept into a detailed flowsheet in minutes.",
    author: "Rahul Mehta",
    designation: "Design Engineer",
  },
  {
    title: "Seamless for automation workflows.",
    content:
      "I used to manually rework every process flow diagram integration—now I auto-generate diagrams and validate control strategies in a single pass.",
    author: "Lucas Fernandez",
    designation: "Automation Engineer",
  },
  {
    title: "Transforms the way I teach chemical engineering.",
    content:
      "My students struggled with HYSYS's learning curve, but with this platform they practice like professionals from day one.",
    author: "Dr. Maria Svensson",
    designation: "Professor of Chemical Engineering",
  },
];

const Reviews: React.FC<ReviewsProps> = ({ reviews = defaultReviews }) => {
  return (
    <section className="py-24 bg-gray-50 dark:bg-gray-950 border-t border-gray-200 dark:border-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-4">
            What Engineers Are Saying
          </h2>
          <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl">
            Don&apos;t just take our word for it. Here&apos;s what industry professionals are saying about our platform.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {reviews.map((review, index) => (
            <Review key={index} {...review} />
          ))}
        </div>
      </div>
    </section>
  );
};

export default Reviews;
