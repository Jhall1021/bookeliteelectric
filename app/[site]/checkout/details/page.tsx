import { Suspense } from "react";
import CheckoutDetailsForm from "./CheckoutDetailsForm";

// useSearchParams() (used inside CheckoutDetailsForm to read the date/window
// picked on the previous step) requires a Suspense boundary in the App
// Router — otherwise Next.js can't statically prerender this route.
export default function CheckoutDetailsPage() {
  return (
    <Suspense fallback={<div className="py-16 text-center text-slate">Loading...</div>}>
      <CheckoutDetailsForm />
    </Suspense>
  );
}
