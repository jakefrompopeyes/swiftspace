import { ArrowRight, Zap, Shield, TrendingUp, BarChart3, Lock, Globe, ChevronRight, Check } from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { ImageWithFallback } from './figma/ImageWithFallback';

interface LandingPageProps {
  onNavigateAuth?: () => void;
}

export function LandingPage({ onNavigateAuth }: LandingPageProps) {
  return (
    <div className="min-h-screen bg-[#1a1a1a]">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#1a1a1a]/80 backdrop-blur-lg border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-7 h-7 text-white" />
              <span className="text-white text-xl">SwiftSpace</span>
            </div>

            <nav className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-gray-300 hover:text-white transition-colors">
                Features
              </a>
              <a href="#how-it-works" className="text-gray-300 hover:text-white transition-colors">
                How it works
              </a>
              <a href="#pricing" className="text-gray-300 hover:text-white transition-colors">
                Pricing
              </a>
              <a href="#about" className="text-gray-300 hover:text-white transition-colors">
                About
              </a>
            </nav>

            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                className="text-white hover:bg-white/10"
                onClick={onNavigateAuth}
              >
                Sign in
              </Button>
              <Button
                className="bg-[#b1ff0a] text-black hover:bg-[#a0ef00]"
                onClick={onNavigateAuth}
              >
                Get started
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <Badge className="bg-[#a54df1]/20 text-[#a54df1] border-[#a54df1]/30 mb-6 px-4 py-2 rounded-full">
                <Zap className="w-4 h-4 mr-2" />
                Lightning-fast crypto payments
              </Badge>

              <h1 className="text-white text-5xl lg:text-6xl mb-6 leading-tight">
                Accept crypto payments{' '}
                <span className="text-[#b1ff0a]">instantly</span>
              </h1>

              <p className="text-gray-400 text-lg mb-8 max-w-xl">
                SwiftSpace is the modern payment processor that lets you accept Bitcoin, Ethereum,
                and 50+ cryptocurrencies with zero hassle. Get paid faster, anywhere in the world.
              </p>

              <div className="flex flex-wrap gap-4">
                <Button className="bg-[#b1ff0a] text-black hover:bg-[#a0ef00] px-8 py-6" onClick={onNavigateAuth}>
                  Start accepting crypto
                  <ArrowRight className="ml-2 w-5 h-5" />
                </Button>
                <Button
                  variant="outline"
                  className="border-gray-700 text-white hover:bg-white/10 px-8 py-6"
                >
                  View demo
                </Button>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-8 mt-12">
                <div>
                  <div className="text-white text-3xl mb-1">$2.4B+</div>
                  <div className="text-gray-500 text-sm">Processed</div>
                </div>
                <div>
                  <div className="text-white text-3xl mb-1">150K+</div>
                  <div className="text-gray-500 text-sm">Businesses</div>
                </div>
                <div>
                  <div className="text-white text-3xl mb-1">99.9%</div>
                  <div className="text-gray-500 text-sm">Uptime</div>
                </div>
              </div>
            </div>

            <div className="relative">
              <div className="bg-[#f5f5f5] rounded-3xl p-8 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-[#a54df1]/20 rounded-full blur-3xl" />
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-[#b1ff0a]/20 rounded-full blur-3xl" />
                
                <ImageWithFallback
                  src="https://images.unsplash.com/photo-1590286162167-70fb467846ae?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjcnlwdG9jdXJyZW5jeSUyMGJsb2NrY2hhaW4lMjB0ZWNobm9sb2d5fGVufDF8fHx8MTc2MDkyOTIzMnww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral"
                  alt="Crypto payments"
                  className="relative z-10 rounded-2xl w-full h-auto shadow-2xl"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <Badge className="bg-[#225aeb]/20 text-[#225aeb] border-[#225aeb]/30 mb-4 px-4 py-2 rounded-full">
              Features
            </Badge>
            <h2 className="text-white text-4xl mb-4">Everything you need to get paid</h2>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto">
              Built for modern businesses. Accept, manage, and track crypto payments with ease.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: Zap,
                title: 'Instant settlements',
                description: 'Get paid in seconds, not days. Funds arrive in your wallet instantly.',
                color: '#b1ff0a',
              },
              {
                icon: Shield,
                title: 'Bank-grade security',
                description: 'Multi-signature wallets and cold storage keep your funds safe.',
                color: '#a54df1',
              },
              {
                icon: Globe,
                title: 'Global payments',
                description: 'Accept payments from anywhere in the world with zero borders.',
                color: '#225aeb',
              },
              {
                icon: TrendingUp,
                title: 'Real-time analytics',
                description: 'Track revenue, conversions, and customer behavior in real-time.',
                color: '#b1ff0a',
              },
              {
                icon: Lock,
                title: 'Regulatory compliance',
                description: 'Built-in KYC/AML compliance for regulated businesses.',
                color: '#a54df1',
              },
              {
                icon: BarChart3,
                title: 'Advanced reporting',
                description: 'Export transaction data and generate custom reports.',
                color: '#225aeb',
              },
            ].map((feature, idx) => (
              <div
                key={idx}
                className="bg-[#f5f5f5] rounded-3xl p-8 hover:scale-105 transition-transform cursor-pointer group"
              >
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform"
                  style={{ backgroundColor: feature.color }}
                >
                  <feature.icon className="w-6 h-6 text-black" />
                </div>
                <h3 className="text-xl mb-3">{feature.title}</h3>
                <p className="text-gray-600">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section id="how-it-works" className="py-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <Badge className="bg-[#a54df1]/20 text-[#a54df1] border-[#a54df1]/30 mb-4 px-4 py-2 rounded-full">
              How it works
            </Badge>
            <h2 className="text-white text-4xl mb-4">Get started in minutes</h2>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto">
              Integration is simple. Start accepting crypto payments in just three steps.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: '01',
                title: 'Create account',
                description: 'Sign up and verify your business in under 5 minutes.',
              },
              {
                step: '02',
                title: 'Integrate API',
                description: 'Add our payment widget to your website or app with simple code.',
              },
              {
                step: '03',
                title: 'Start earning',
                description: 'Accept payments and watch your revenue grow in real-time.',
              },
            ].map((item, idx) => (
              <div key={idx} className="relative">
                <div className="bg-[#f5f5f5] rounded-3xl p-8">
                  <div className="text-6xl mb-6 opacity-20">{item.step}</div>
                  <h3 className="text-xl mb-3">{item.title}</h3>
                  <p className="text-gray-600">{item.description}</p>
                </div>
                {idx < 2 && (
                  <ChevronRight className="hidden md:block absolute top-1/2 -right-4 transform -translate-y-1/2 w-8 h-8 text-gray-700" />
                )}
              </div>
            ))}
          </div>

          <div className="mt-12 text-center">
            <Button className="bg-[#b1ff0a] text-black hover:bg-[#a0ef00] px-8 py-6" onClick={onNavigateAuth}>
              View documentation
              <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <Badge className="bg-[#225aeb]/20 text-[#225aeb] border-[#225aeb]/30 mb-4 px-4 py-2 rounded-full">
              Pricing
            </Badge>
            <h2 className="text-white text-4xl mb-4">Simple, transparent pricing</h2>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto">
              First month free. Simple monthly plans. Upgrade as you grow.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {[
              {
                name: 'Starter',
                price: '1.5%',
                description: 'Perfect for small businesses',
                features: [
                  'Up to $10k/month',
                  '5+ cryptocurrencies',
                  'Basic analytics',
                  'Email support',
                ],
                color: 'bg-[#f5f5f5]',
                buttonColor: 'bg-black text-white hover:bg-gray-800',
              },
              {
                name: 'Professional',
                price: '0.9%',
                description: 'For growing businesses',
                features: [
                  'Up to $100k/month',
                  '50+ cryptocurrencies',
                  'Advanced analytics',
                  'Priority support',
                  'API access',
                  'Custom branding',
                ],
                color: 'bg-[#b1ff0a]',
                buttonColor: 'bg-black text-white hover:bg-gray-800',
                popular: true,
              },
              {
                name: 'Enterprise',
                price: 'Custom',
                description: 'For large organizations',
                features: [
                  'Unlimited volume',
                  'All cryptocurrencies',
                  'White-label solution',
                  'Dedicated account manager',
                  'Custom integration',
                  'SLA guarantee',
                ],
                color: 'bg-[#f5f5f5]',
                buttonColor: 'bg-black text-white hover:bg-gray-800',
              },
            ].map((plan, idx) => (
              <div
                key={idx}
                className={`${plan.color} rounded-3xl p-8 relative ${
                  plan.popular ? 'ring-2 ring-black scale-105' : ''
                }`}
              >
                {plan.popular && (
                  <Badge className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-black text-white px-4 py-1 rounded-full">
                    Most popular
                  </Badge>
                )}
                <div className="mb-6">
                  <div className="text-sm mb-2 text-gray-600">{plan.name}</div>
                  <div className="text-4xl mb-2">{plan.price}</div>
                  <div className="text-sm text-gray-600">{plan.description}</div>
                </div>

                <ul className="space-y-3 mb-8">
                  {plan.features.map((feature, fIdx) => (
                    <li key={fIdx} className="flex items-start gap-2">
                      <Check className="w-5 h-5 flex-shrink-0 mt-0.5" />
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>

                <Button className={`w-full ${plan.buttonColor}`}>
                  {plan.price === 'Custom' ? 'Contact sales' : 'Get started'}
                </Button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="bg-gradient-to-r from-[#a54df1] to-[#225aeb] rounded-3xl p-12 text-center relative overflow-hidden">
            <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-3xl" />
            <div className="absolute bottom-0 left-0 w-96 h-96 bg-black/20 rounded-full blur-3xl" />
            
            <div className="relative z-10">
              <h2 className="text-white text-4xl mb-4">Ready to get started?</h2>
              <p className="text-white/80 text-lg mb-8">
                Join thousands of businesses already accepting crypto payments with SwiftSpace.
              </p>
              <div className="flex flex-wrap gap-4 justify-center">
                <Button className="bg-[#b1ff0a] text-black hover:bg-[#a0ef00] px-8 py-6" onClick={onNavigateAuth}>
                  Create free account
                  <ArrowRight className="ml-2 w-5 h-5" />
                </Button>
                <Button
                  variant="outline"
                  className="border-white text-white hover:bg-white/20 px-8 py-6"
                >
                  Schedule demo
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-800 py-12 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 className="w-6 h-6 text-white" />
                <span className="text-white">SwiftSpace</span>
              </div>
              <p className="text-gray-500 text-sm">
                The modern crypto payment processor for the future of finance.
              </p>
            </div>

            <div>
              <div className="text-white mb-4">Product</div>
              <ul className="space-y-2 text-sm text-gray-500">
                <li>
                  <a href="#" className="hover:text-white transition-colors">
                    Features
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white transition-colors">
                    Pricing
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white transition-colors">
                    Documentation
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white transition-colors">
                    API Reference
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <div className="text-white mb-4">Company</div>
              <ul className="space-y-2 text-sm text-gray-500">
                <li>
                  <a href="#" className="hover:text-white transition-colors">
                    About
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white transition-colors">
                    Blog
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white transition-colors">
                    Careers
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white transition-colors">
                    Contact
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <div className="text-white mb-4">Legal</div>
              <ul className="space-y-2 text-sm text-gray-500">
                <li>
                  <a href="#" className="hover:text-white transition-colors">
                    Privacy
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white transition-colors">
                    Terms
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white transition-colors">
                    Security
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white transition-colors">
                    Compliance
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="border-t border-gray-800 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-gray-500 text-sm">© 2025 SwiftSpace. All rights reserved.</p>
            <div className="flex gap-6">
              <a href="#" className="text-gray-500 hover:text-white transition-colors">
                Twitter
              </a>
              <a href="#" className="text-gray-500 hover:text-white transition-colors">
                LinkedIn
              </a>
              <a href="#" className="text-gray-500 hover:text-white transition-colors">
                GitHub
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
