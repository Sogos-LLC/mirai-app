'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';

// Redirect old preview route to new immersive preview
export default function OldPreviewRedirect() {
  const params = useParams();
  const router = useRouter();
  const courseId = params.courseId as string;

  useEffect(() => {
    router.replace(`/preview/${courseId}`);
  }, [courseId, router]);

  return null;
}
