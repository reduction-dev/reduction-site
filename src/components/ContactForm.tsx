import { useState, useRef } from 'react';

export default function ContactForm() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [error, setError] = useState('');
  const formRef = useRef<HTMLFormElement>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!formRef.current) return;

    setStatus('loading');
    setError('');

    try {
      const response = await fetch('/api/contact-requests', {
        method: 'POST',
        body: new FormData(formRef.current)
      });
      
      const data = await response.json();

      if (response.status >= 500) {
        setStatus('error');
        return;
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
      console.error('Failed to submit', err);
      setError('Failed to submit form');
      setStatus('error');
    }
  };

  return (
    <form ref={formRef} className="space-y-6 max-w-xlg" onSubmit={handleSubmit}>
      <div>
        <label htmlFor="name" className="block text-base font-light mb-2">
          Name <span className="text-red-700" title="required">*</span>
        </label>
        <input
          type="text"
          id="name"
          name="name"
          className="w-full px-4 py-2 border"
          disabled={status === 'loading'}
          required
        />
      </div>
      <div>
        <label htmlFor="company" className="block text-base font-light mb-2">Company</label>
        <input
          type="text"
          id="company"
          name="company"
          className="w-full px-4 py-2 border"
          disabled={status === 'loading'}
        />
      </div>
      <div>
        <label htmlFor="phone" className="block text-base font-light mb-2">Phone Number</label>
        <input
          type="tel"
          id="phone"
          name="phone"
          className="w-full px-4 py-2 border"
          disabled={status === 'loading'}
        />
      </div>
      <div>
        <label htmlFor="email" className="block text-base font-light mb-2">
          Email <span className="text-red-700" title="required">*</span>
        </label>
        <input
          type="email"
          id="email"
          name="email"
          className="w-full px-4 py-2 border"
          disabled={status === 'loading'}
          required
        />
      </div>
      <div>
        <label htmlFor="useCase" className="block text-base font-light mb-2">Use case</label>
        <textarea
          id="useCase"
          name="useCase"
          rows={4}
          className="w-full px-4 py-2 border"
          disabled={status === 'loading'}
        />
      </div>
      <button
        type="submit"
        className="px-6 py-2 bg-blue-950 text-white rounded-md hover:bg-blue-900 disabled:opacity-50 disabled:cursor-not-allowed"
        disabled={status === 'loading'}
      >
        Send
      </button>
      {status === 'error' && <p className="text-red-700">{error}</p>}
      {status === 'success' && <p className="text-green-700">Talk to you soon!</p>}
    </form>
  );
}

interface ErrorResponse {
  success: false;
  error: string;
}
