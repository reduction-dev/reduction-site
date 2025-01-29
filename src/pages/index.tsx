import type {ReactNode} from 'react';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';

import PixelFlow from '../components/PixelFlow';
import NewsletterSignUpForm from '../components/NewsletterSignUpForm';
import ContactForm from '../components/ContactForm';

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
          <h2 className="text-2xl font-bold mb-8">Let's build a Reduction job together</h2>
          <div className="space-y-6 max-w-xlg">
            <ContactForm />
          </div>
        </div>
      </main>
    </Layout>
  );
}
