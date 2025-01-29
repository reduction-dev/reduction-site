import type {ReactNode} from 'react';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';

import PixelFlow from '../components/PixelFlow';
import NewsletterSignUpForm from '../components/NewsletterSignUpForm';

export default function Home(): ReactNode {
  const {siteConfig} = useDocusaurusContext();
  return (
    <Layout
      title={`Hello from ${siteConfig.title}`}
      description="Description will go into a meta tag in <head />">
      <div className="bg-black flex-row">
        <div>
          <PixelFlow />
        </div>
        <div>
          <p className="text-white text-2xl text-center pb-8">{siteConfig.tagline}</p>
        </div>
      </div>
      <main className="p-10 text-lg max-w-4xl mx-auto">
        <p className="text-lg pb-6 text-balance text-center">
          Reduction lets small teams of software engineers build stateful data
          pipelines. If you can use a hash map then you can create a Reduction
          job to power realtime analytics.
        </p>
        
        <div className="flex max-w-md mx-auto">
          <NewsletterSignUpForm />
        </div>

        <div className="mt-16 max-w-2xl mx-auto">
          <h2 className="text-2xl font-bold mb-8">Let's build your first Reduction job together</h2>
          <form className="space-y-6 max-w-xlg" onSubmit={(e) => e.preventDefault()}>
            <div>
              <label htmlFor="name" className="block text-base font-light mb-2">Name</label>
              <input
                type="text"
                id="name"
                className="w-full px-4 py-2 border"
              />
            </div>
            <div>
              <label htmlFor="company" className="block text-base font-light mb-2">Company</label>
              <input
                type="text"
                id="company"
                className="w-full px-4 py-2 border"
              />
            </div>
            <div>
              <label htmlFor="phone" className="block text-base font-light mb-2">Phone Number</label>
              <input
                type="tel"
                id="phone"
                className="w-full px-4 py-2 border"
              />
            </div>
            <div>
              <label htmlFor="email" className="block text-base font-light mb-2">Email</label>
              <input
                type="email"
                id="email"
                className="w-full px-4 py-2 border"
              />
            </div>
            <div>
              <label htmlFor="useCase" className="block text-base font-light mb-2">Use case</label>
              <textarea
                id="useCase"
                rows={4}
                className="w-full px-4 py-2 border" 
              />
            </div>
            <button
              type="submit"
              className="px-6 py-2 bg-blue-950 text-white rounded-md hover:bg-blue-900"
            >
              Send
            </button>
          </form>
        </div>
      </main>
    </Layout>
  );
}
