'use client';
import { useSearchParams } from 'next/navigation';
import Header from '@/app/components/header';
export default function Page() {
  const plan = useSearchParams().get('plan') ?? 'free';
  return (<main><Header /><p>Selected plan: {plan}</p></main>);
}
