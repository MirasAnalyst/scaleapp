import { FaStar } from "react-icons/fa";

interface ReviewProps {
  rating: number;
  title: string;
  content: string;
  author: string;
  designation: string;
}

const Review: React.FC<ReviewProps> = ({
  rating = 5,
  title = "Default Title",
  content = "Default content for the review.",
  author = "John Doe",
  designation = "Customer",
}) => {
  return (
    <div className="group bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-500 hover:-translate-y-2 border border-gray-100 dark:border-gray-700">
      {/* Quote Icon */}
      <div className="text-blue-500 dark:text-blue-400 mb-4">
        <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
          <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h4v10h-10z"/>
        </svg>
      </div>
      
      {/* Rating */}
      <div className="flex items-center mb-4">
        {[...Array(5)].map((_, i) => (
          <FaStar key={i} className={`w-5 h-5 ${i < rating ? "text-yellow-400" : "text-gray-300"}`} />
        ))}
      </div>
      
      {/* Title */}
      <h3 className="text-xl font-bold mb-4 text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
        {title}
      </h3>
      
      {/* Content */}
      <p className="text-gray-600 dark:text-gray-300 mb-6 leading-relaxed text-lg">
        &ldquo;{content}&rdquo;
      </p>
      
      {/* Author */}
      <div className="flex items-center pt-4 border-t border-gray-100 dark:border-gray-700">
        <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-white font-bold text-lg mr-4">
          {author.split(' ').map(n => n[0]).join('')}
        </div>
        <div>
          <p className="font-semibold text-gray-900 dark:text-white">{author}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">{designation}</p>
        </div>
      </div>
    </div>
  );
};

export default Review;
