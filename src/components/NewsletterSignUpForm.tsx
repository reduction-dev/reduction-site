import { useState, useRef } from 'react';

export default function NewsletterSignUpForm() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [error, setError] = useState('');
  const formRef = useRef<HTMLFormElement>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!formRef.current) return;

    setStatus('loading');
    setError('');

    try {
      const response = await fetch('/api/newsletter-sign-ups', {
        method: 'POST',
        body: new FormData(formRef.current)
      });
      
      const data = await response.json();

      if (response.status >= 500) {
        setStatus('error');
      }
      
      if (response.status >= 400) {
        const errorBody = data as ErrorResponse;
        setError(errorBody.error);
        setStatus('error');
        return;
      }

      setStatus('success');
      formRef.current.reset();
    } catch (err) {
      console.error('Failed to sign up', err);
      setError('Failed to sign up');
      setStatus('error');
    }
  };

  return (
    <div>
      <form ref={formRef} onSubmit={handleSubmit}>
        <input
          type="email"
          name="email"
          placeholder="Enter your email"
          className="px-4 py-2 border flex-grow"
          disabled={status === 'loading'}
          required
        />
        <button 
          type="submit" 
          className="px-6 py-2 bg-blue-950 text-white hover:bg-blue-900 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={status === 'loading'}
        >
          Sign up for updates
        </button>
      </form>
      {status === 'error' && <p className="text-red-700 pt-2">{error}</p>}
      {status === 'success' && <p className="text-green-700 pt-2">Thanks for signing up!</p>}
    </div>
  );
}

interface ErrorResponse {
  success: false;
  error: string;
}
