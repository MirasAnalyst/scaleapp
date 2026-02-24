'use client';

import { useState } from 'react';
import Header from "components/Header";
import Footer from "components/Footer";
import { Send, Loader2, CheckCircle, AlertCircle, MapPin, Phone, Mail, Clock, ArrowRight, Calendar } from 'lucide-react';

export default function ContactPage() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    message: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim() || !formData.email.trim() || !formData.message.trim()) {
      setError('Please fill in all fields');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.name.trim(),
          email: formData.email.trim(),
          message: formData.message.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send message');
      }

      setIsSubmitted(true);
      setFormData({ name: '', email: '', message: '' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-white dark:bg-gray-950">
      <Header />

      <main>
        {/* Hero Section */}
        <section className="relative overflow-hidden bg-white dark:bg-gray-950 pt-32 lg:pt-40 pb-20">
          {/* Subtle radial gradient blob — matches main landing page */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />

          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto">
              {/* Badge pill */}
              <div className="inline-flex items-center px-3 py-1 rounded-full border border-gray-300 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-400 mb-6">
                <Mail className="w-4 h-4 mr-2" />
                Get in Touch
              </div>

              {/* Headline */}
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 dark:text-white mb-6 leading-[1.1]">
                Let&apos;s build something{' '}
                <span className="text-blue-600">amazing</span> together
              </h1>

              {/* Subheadline */}
              <p className="text-lg text-gray-600 dark:text-gray-400 mb-8 max-w-2xl mx-auto leading-relaxed">
                Have questions about our AI-powered engineering platform? Need help with your project? We&apos;re here to help.
              </p>
            </div>
          </div>
        </section>

        {/* Schedule a Demo CTA */}
        <section className="bg-white dark:bg-gray-950">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="rounded-2xl border border-gray-200 dark:border-gray-800 p-8 sm:p-10 flex flex-col sm:flex-row items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center">
                  <Calendar className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                    Schedule a Demo
                  </h2>
                  <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">
                    See the platform in action with a personalized 30-minute walkthrough.
                  </p>
                </div>
              </div>
              <a
                href="https://cal.com/miras-muratov-uyocve/30min"
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex items-center justify-center px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors flex-shrink-0"
              >
                Book a Time
                <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-0.5 transition-transform" />
              </a>
            </div>
          </div>
        </section>

        {/* Contact Section */}
        <section className="py-20 bg-white dark:bg-gray-950">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
              {/* Contact Form */}
              <div className="lg:col-span-2">
                <div className="rounded-2xl border border-gray-200 dark:border-gray-800 p-8">
                  <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">
                    Send us a Message
                  </h2>

                  {isSubmitted ? (
                    <div className="text-center py-12">
                      <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                      <h3 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
                        Message Sent Successfully!
                      </h3>
                      <p className="text-gray-600 dark:text-gray-400 mb-6">
                        Thank you for reaching out. We&apos;ll get back to you within 24 hours.
                      </p>
                      <button
                        onClick={() => setIsSubmitted(false)}
                        className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
                      >
                        Send Another Message
                      </button>
                    </div>
                  ) : (
                    <form onSubmit={handleSubmit} className="space-y-6">
                      {/* Name Field */}
                      <div>
                        <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Full Name
                        </label>
                        <input
                          type="text"
                          id="name"
                          name="name"
                          value={formData.name}
                          onChange={handleInputChange}
                          className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                          placeholder="Enter your full name"
                          required
                        />
                      </div>

                      {/* Email Field */}
                      <div>
                        <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Email Address
                        </label>
                        <input
                          type="email"
                          id="email"
                          name="email"
                          value={formData.email}
                          onChange={handleInputChange}
                          className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                          placeholder="Enter your email address"
                          required
                        />
                      </div>

                      {/* Message Field */}
                      <div>
                        <label htmlFor="message" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Message
                        </label>
                        <textarea
                          id="message"
                          name="message"
                          value={formData.message}
                          onChange={handleInputChange}
                          rows={6}
                          className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors resize-none"
                          placeholder="Tell us about your project or question..."
                          required
                        />
                      </div>

                      {/* Error Message */}
                      {error && (
                        <div className="flex items-center space-x-2 text-red-600 dark:text-red-400">
                          <AlertCircle className="w-4 h-4" />
                          <span className="text-sm">{error}</span>
                        </div>
                      )}

                      {/* Submit Button */}
                      <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full flex items-center justify-center space-x-2 px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {isLoading ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <Send className="w-5 h-5" />
                        )}
                        <span>{isLoading ? 'Sending...' : 'Send Message'}</span>
                      </button>
                    </form>
                  )}
                </div>
              </div>

              {/* Contact Information Sidebar */}
              <div className="lg:col-span-1">
                <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 p-8">
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-8">
                    Contact Information
                  </h3>

                  <div className="space-y-6">
                    {/* Office Address */}
                    <div className="flex items-start space-x-4">
                      <div className="flex-shrink-0 w-10 h-10 bg-blue-600/10 dark:bg-blue-500/10 rounded-lg flex items-center justify-center">
                        <MapPin className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <h4 className="font-medium text-gray-900 dark:text-white mb-1 text-sm">
                          Office Address
                        </h4>
                        <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                          Washington DC, USA
                        </p>
                      </div>
                    </div>

                    {/* Phone */}
                    <div className="flex items-start space-x-4">
                      <div className="flex-shrink-0 w-10 h-10 bg-blue-600/10 dark:bg-blue-500/10 rounded-lg flex items-center justify-center">
                        <Phone className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <h4 className="font-medium text-gray-900 dark:text-white mb-1 text-sm">
                          Phone
                        </h4>
                        <p className="text-gray-600 dark:text-gray-400 text-sm">
                          <a href="tel:+15713731562" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                            +1 (571) 373-1562
                          </a>
                        </p>
                      </div>
                    </div>

                    {/* Support Email */}
                    <div className="flex items-start space-x-4">
                      <div className="flex-shrink-0 w-10 h-10 bg-blue-600/10 dark:bg-blue-500/10 rounded-lg flex items-center justify-center">
                        <Mail className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <h4 className="font-medium text-gray-900 dark:text-white mb-1 text-sm">
                          Support Email
                        </h4>
                        <p className="text-gray-600 dark:text-gray-400 text-sm">
                          <a href="mailto:miras.muratov@uscaleapp.com" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                            miras.muratov@uscaleapp.com
                          </a>
                        </p>
                      </div>
                    </div>

                    {/* Business Hours */}
                    <div className="flex items-start space-x-4">
                      <div className="flex-shrink-0 w-10 h-10 bg-blue-600/10 dark:bg-blue-500/10 rounded-lg flex items-center justify-center">
                        <Clock className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <h4 className="font-medium text-gray-900 dark:text-white mb-1 text-sm">
                          Business Hours
                        </h4>
                        <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                          Monday - Friday: 9:00 AM - 6:00 PM PST<br />
                          Saturday: 10:00 AM - 4:00 PM PST<br />
                          Sunday: Closed
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Response time note */}
                  <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-800">
                    <p className="text-sm text-gray-500 dark:text-gray-500 leading-relaxed">
                      We typically respond to all inquiries within 24 hours during business days. For urgent technical support, please call our phone number.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
