import React from "react";
import { Star } from "lucide-react";
import { toPersianDigits } from "@/lib/format";

interface StarRatingProps {
  rating: number;
  maxStars?: number;
  size?: "sm" | "md" | "lg";
  showValue?: boolean;
}

const sizeClasses = {
  sm: "h-3.5 w-3.5",
  md: "h-4 w-4",
  lg: "h-5 w-5",
};

const colorClasses = {
  filled: "fill-amber-400 text-amber-400",
  unfilled: "text-muted-foreground",
};

export const StarRating = React.memo(function StarRating({
  rating,
  maxStars = 5,
  size = "md",
  showValue = false,
}: StarRatingProps) {
  const starSize = sizeClasses[size];

  return (
    <div className="flex items-center justify-center gap-1" data-testid="star-rating">
      {Array.from({ length: maxStars }, (_, i) => (
        <Star
          key={i}
          className={`${starSize} ${
            i < rating ? colorClasses.filled : colorClasses.unfilled
          }`}
        />
      ))}
      {showValue && (
        <span className="ml-1 text-sm text-muted-foreground">
          {toPersianDigits(rating)}
        </span>
      )}
    </div>
  );
});
