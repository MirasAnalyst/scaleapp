interface ReviewProps {
  title: string;
  content: string;
  author: string;
  designation: string;
}

const Review: React.FC<ReviewProps> = ({
  title = "Default Title",
  content = "Default content for the review.",
  author = "John Doe",
  designation = "Customer",
}) => {
  const initials = author
    .split(' ')
    .map((n) => n[0])
    .join('');

  return (
    <div className="bg-white dark:bg-gray-900 p-6 rounded-xl border border-gray-200 dark:border-gray-800 transition-colors hover:border-gray-300 dark:hover:border-gray-700">
      {/* Title */}
      <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3">
        {title}
      </h3>

      {/* Content */}
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-6 leading-relaxed">
        &ldquo;{content}&rdquo;
      </p>

      {/* Author */}
      <div className="flex items-center pt-4 border-t border-gray-100 dark:border-gray-800">
        <div className="w-9 h-9 bg-gray-200 dark:bg-gray-800 rounded-full flex items-center justify-center text-gray-600 dark:text-gray-400 text-sm font-medium mr-3">
          {initials}
        </div>
        <div>
          <p className="text-sm font-medium text-gray-900 dark:text-white">{author}</p>
          <p className="text-xs text-gray-500 dark:text-gray-500">{designation}</p>
        </div>
      </div>
    </div>
  );
};

export default Review;
