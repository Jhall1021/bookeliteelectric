import Link from "next/link";
import type { ReactNode } from "react";

type Props = {
  href: string;
  children?: ReactNode;
  className?: string;
};

/**
 * The homeowner-facing name always points to the explanation behind it.
 * Keeping that rule in one component prevents a pricing promise from becoming
 * unexplained copy as new storefront surfaces are added.
 */
export default function WhileWereThereLink({
  href,
  children = "While We’re There pricing",
  className = "font-medium text-electric underline decoration-electric/35 underline-offset-2 hover:decoration-electric",
}: Props) {
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}
