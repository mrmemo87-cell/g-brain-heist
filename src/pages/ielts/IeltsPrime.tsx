import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../../services/supabaseClient';
import DotLottieAnimation from '../../../components/DotLottieAnimation';

interface PrimeFormData {
  fullName: string;
  email: string;
  phone: string;
  targetBand: string;
  examDate: string;
  currentLevel: string;
  goals: string;
  paymentMethod: string;
}

// 35 testimonials from different nationalities
const testimonials = [
  { name: 'Sarah M.', country: '🇬🇧 UK', score: '7.5', text: 'Prime helped me improve from 6.0 to 7.5 in just 2 months!' },
  { name: 'Ahmed K.', country: '🇸🇦 Saudi', score: '8.0', text: 'The expert feedback on my writing was invaluable. Highly recommend!' },
  { name: 'Lin W.', country: '🇨🇳 China', score: '7.0', text: 'Best investment for my IELTS preparation. The practice tests are amazing.' },
  { name: 'Priya S.', country: '🇮🇳 India', score: '7.5', text: 'Finally got my target score for Canada immigration. Thank you Prime!' },
  { name: 'Carlos R.', country: '🇧🇷 Brazil', score: '6.5', text: 'The speaking practice sessions transformed my confidence completely.' },
  { name: 'Fatima Z.', country: '🇦🇪 UAE', score: '8.0', text: 'From Band 5 to 8 in 3 months. The structured approach really works!' },
  { name: 'Yuki T.', country: '🇯🇵 Japan', score: '7.0', text: 'Reading section tips helped me manage time much better in the exam.' },
  { name: 'Mohammed A.', country: '🇪🇬 Egypt', score: '7.5', text: 'Excellent materials and personalized feedback. Worth every penny!' },
  { name: 'Anna P.', country: '🇷🇺 Russia', score: '7.5', text: 'The writing templates and vocabulary lists were game-changers.' },
  { name: 'David L.', country: '🇰🇷 Korea', score: '6.5', text: 'Got into my dream university in Australia thanks to Prime!' },
  { name: 'Sofia G.', country: '🇲🇽 Mexico', score: '7.0', text: 'Listening practice with different accents prepared me perfectly.' },
  { name: 'Nguyen T.', country: '🇻🇳 Vietnam', score: '7.5', text: 'Improved from 6.0 to 7.5 - exactly what I needed for nursing registration.' },
  { name: 'Omar H.', country: '🇯🇴 Jordan', score: '8.0', text: 'The mock tests were harder than the real exam. Great preparation!' },
  { name: 'Elena V.', country: '🇺🇦 Ukraine', score: '7.0', text: 'Prime tutors helped me understand exactly where I was losing marks.' },
  { name: 'Wei C.', country: '🇹🇼 Taiwan', score: '7.5', text: 'Achieved my target score on the first attempt. Very efficient system!' },
  { name: 'Aisha N.', country: '🇳🇬 Nigeria', score: '7.5', text: 'The grammar corrections on my essays were incredibly detailed.' },
  { name: 'Hassan M.', country: '🇵🇰 Pakistan', score: '7.0', text: 'Got Band 7 in all sections. Highly recommend for serious students!' },
  { name: 'Maria C.', country: '🇵🇭 Philippines', score: '8.0', text: 'Already good at English but Prime helped me reach Band 8!' },
  { name: 'Raj K.', country: '🇱🇰 Sri Lanka', score: '7.5', text: 'The video lessons for Speaking Part 2 were extremely helpful.' },
  { name: 'Leila F.', country: '🇮🇷 Iran', score: '7.0', text: 'Finally understood how to structure Task 2 essays properly.' },
  { name: 'Tom N.', country: '🇹🇭 Thailand', score: '6.5', text: 'Customer support was excellent. They really care about students.' },
  { name: 'Olga S.', country: '🇵🇱 Poland', score: '7.5', text: 'Improved my vocabulary for academic writing significantly.' },
  { name: 'Ibrahim D.', country: '🇹🇷 Turkey', score: '7.0', text: 'The band score estimator was very accurate. Knew exactly where I stood.' },
  { name: 'Kim J.', country: '🇲🇾 Malaysia', score: '7.5', text: 'Great value compared to in-person coaching. More convenient too!' },
  { name: 'Amira B.', country: '🇲🇦 Morocco', score: '7.0', text: 'Loved the progress tracking. Kept me motivated throughout.' },
  { name: 'Chen H.', country: '🇭🇰 Hong Kong', score: '8.0', text: 'Exceeded my target! The strategies for Reading True/False/NG were perfect.' },
  { name: 'Ravi M.', country: '🇧🇩 Bangladesh', score: '7.0', text: 'Affordable and effective. Got my score for UK visa requirements.' },
  { name: 'Lisa K.', country: '🇩🇪 Germany', score: '7.5', text: 'Native speaker tips for Speaking were really authentic and useful.' },
  { name: 'Juan P.', country: '🇨🇴 Colombia', score: '6.5', text: 'The flexible schedule fit perfectly with my work hours.' },
  { name: 'Mei L.', country: '🇸🇬 Singapore', score: '8.0', text: 'Needed Band 8 for professional registration. Prime delivered!' },
  { name: 'Tariq S.', country: '🇶🇦 Qatar', score: '7.0', text: 'Excellent preparation for Academic IELTS. Very comprehensive!' },
  { name: 'Nina R.', country: '🇷🇸 Serbia', score: '7.5', text: 'The cohesion and coherence tips improved my writing dramatically.' },
  { name: 'Ali Z.', country: '🇰🇼 Kuwait', score: '6.5', text: 'From struggling with Listening to feeling confident. Great audio resources!' },
  { name: 'Hana Y.', country: '🇮🇩 Indonesia', score: '7.0', text: 'Mobile app made it easy to practice during my commute.' },
  { name: 'Victor O.', country: '🇰🇪 Kenya', score: '7.5', text: 'Got scholarship to study in Canada. Prime was essential for my success!' },
];

const IeltsPrime: React.FC = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState<PrimeFormData>({
    fullName: '',
    email: '',
    phone: '',
    targetBand: '',
    examDate: '',
    currentLevel: '',
    goals: '',
    paymentMethod: 'monthly',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Carousel state
  const [carouselIndex, setCarouselIndex] = useState(0);
  const carouselRef = useRef<HTMLDivElement>(null);
  const [carouselCardWidth, setCarouselCardWidth] = useState(300);
  const [carouselStep, setCarouselStep] = useState(320);
  
  // Scroll to top on mount
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);
  
  // Auto-scroll carousel
  useEffect(() => {
    const interval = setInterval(() => {
      setCarouselIndex(prev => (prev + 1) % testimonials.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const updateCarouselSizing = () => {
      const viewportWidth = window.innerWidth || 0;
      const horizontalPadding = 48;
      const minCardWidth = 240;
      const maxCardWidth = 300;
      const nextCardWidth = Math.max(
        minCardWidth,
        Math.min(maxCardWidth, viewportWidth - horizontalPadding)
      );

      setCarouselCardWidth(nextCardWidth);
      setCarouselStep(nextCardWidth + 20);
    };

    updateCarouselSizing();
    window.addEventListener('resize', updateCarouselSizing);
    return () => window.removeEventListener('resize', updateCarouselSizing);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const { data: userData } = await supabase.auth.getUser();
      
      const { error: insertError } = await supabase
        .from('ielts_prime_applications')
        .insert({
          user_id: userData?.user?.id,
          full_name: formData.fullName,
          email: formData.email,
          phone: formData.phone,
          target_band_score: parseFloat(formData.targetBand) || null,
          test_date: formData.examDate || null,
          current_level: formData.currentLevel,
          goals: formData.goals,
          motivation: formData.goals || 'Apply for Prime membership', // Required field
          payment_method: formData.paymentMethod,
          status: 'pending'
        });

      if (insertError) throw insertError;
      setSubmitted(true);
      window.scrollTo(0, 0);
    } catch (err) {
      console.error('Error submitting application:', err);
      setError('Failed to submit application. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const pricingPlans = [
    {
      id: 'monthly',
      name: 'Monthly',
      price: '$29',
      period: '/month',
      features: ['Cancel anytime', 'Full access to all features'],
      popular: false,
    },
    {
      id: 'quarterly',
      name: 'Quarterly',
      price: '$69',
      period: '/3 months',
      savings: 'Save 20%',
      features: ['Best for exam prep', '3 months of access'],
      popular: true,
    },
    {
      id: 'yearly',
      name: 'Yearly',
      price: '$199',
      period: '/year',
      savings: 'Save 43%',
      features: ['Maximum savings', 'Full year access'],
      popular: false,
    },
  ];

  // Success Screen
  if (submitted) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}>
        <div style={{
          background: 'white',
          borderRadius: '1.5rem',
          padding: 'clamp(2rem, 5vw, 3rem)',
          maxWidth: '500px',
          width: '100%',
          textAlign: 'center',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            marginBottom: '1.5rem',
          }}>
            <DotLottieAnimation
              src="/lotties/Gift premium animation.lottie"
              width={100}
              height={100}
              loop={false}
            />
          </div>
          
          <h1 style={{ fontSize: '1.75rem', color: '#1e293b', marginBottom: '0.75rem', fontWeight: 'bold' }}>
            Application Received!
          </h1>
          
          <p style={{ color: '#64748b', fontSize: '1rem', marginBottom: '1.5rem', lineHeight: 1.6 }}>
            Thank you for your interest in IELTS Prime. Our team will review your application and contact you within 24 hours.
          </p>

          <div style={{
            background: '#f0fdf4',
            border: '1px solid #86efac',
            borderRadius: '0.75rem',
            padding: '1rem',
            marginBottom: '1.5rem',
            textAlign: 'left',
          }}>
            <p style={{ color: '#166534', fontSize: '0.875rem', margin: 0 }}>
              <strong>What's next?</strong>
              <br />• Check your email for confirmation
              <br />• Our advisor will call you to discuss your goals
              <br />• Start your Prime journey!
            </p>
          </div>

          <button
            onClick={() => navigate('/ielts')}
            style={{
              width: '100%',
              padding: '1rem',
              background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '0.75rem',
              fontSize: '1rem',
              fontWeight: 'bold',
              cursor: 'pointer',
            }}
          >
            Return to IELTS Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%)',
    }}>
      {/* Header */}
      <div style={{
        background: 'rgba(255,255,255,0.05)',
        backdropFilter: 'blur(10px)',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        padding: '1rem',
        zIndex: 100,
      }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button
            onClick={() => navigate('/ielts')}
            style={{
              background: 'rgba(255,255,255,0.1)',
              border: 'none',
              color: 'white',
              padding: '0.5rem 1rem',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              fontSize: '0.875rem',
            }}
          >
            ← Back
          </button>
          <div style={{ color: 'white', fontWeight: 'bold', fontSize: '1.125rem' }}>
            ⭐ IELTS Prime
          </div>
          <div style={{ width: '70px' }}></div>
        </div>
      </div>

      {/* Hero Section */}
      <div style={{
        padding: 'clamp(2rem, 5vw, 4rem) 1rem',
        textAlign: 'center',
        color: 'white',
      }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <div style={{
            display: 'inline-block',
            background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
            padding: '0.375rem 1rem',
            borderRadius: '9999px',
            fontSize: '0.75rem',
            fontWeight: 'bold',
            marginBottom: '1rem',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}>
            Premium Membership
          </div>
          
          <h1 style={{
            fontSize: 'clamp(2rem, 6vw, 3rem)',
            fontWeight: 'bold',
            marginBottom: '1rem',
            lineHeight: 1.2,
          }}>
            Achieve Your Target Band Score
          </h1>
          
          <p style={{
            fontSize: 'clamp(1rem, 2.5vw, 1.25rem)',
            color: '#94a3b8',
            marginBottom: '2rem',
            lineHeight: 1.6,
          }}>
            Get unlimited access to practice tests, personalized feedback from IELTS experts, and guaranteed improvement.
          </p>
        </div>
      </div>

      {/* Features Grid */}
      <div style={{
        padding: '0 1rem 3rem',
        maxWidth: '1000px',
        margin: '0 auto',
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '1rem',
          marginBottom: '3rem',
        }}>
          {[
            { icon: '📚', title: 'Unlimited Practice Tests', desc: 'Access all Reading, Listening, Writing & Speaking tests' },
            { icon: '👨‍🏫', title: 'Expert Feedback', desc: 'Detailed feedback from certified IELTS examiners' },
            { icon: '📊', title: 'Progress Tracking', desc: 'Monitor your improvement with detailed analytics' },
            { icon: '🎯', title: 'Personalized Study Plan', desc: 'Custom learning path based on your target score' },
            { icon: '🏆', title: 'Official Certificates', desc: 'Get certificates to showcase your achievements' },
            { icon: '💬', title: 'Priority Support', desc: '24/7 access to our support team' },
          ].map((feature, idx) => (
            <div
              key={idx}
              style={{
                background: 'rgba(255,255,255,0.05)',
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '1rem',
                padding: '1.5rem',
                color: 'white',
              }}
            >
              <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>{feature.icon}</div>
              <h3 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>{feature.title}</h3>
              <p style={{ fontSize: '0.875rem', color: '#94a3b8', margin: 0, lineHeight: 1.5 }}>{feature.desc}</p>
            </div>
          ))}
        </div>

        {/* Pricing Cards */}
        <h2 style={{ color: 'white', textAlign: 'center', fontSize: '1.5rem', marginBottom: '1.5rem' }}>
          Choose Your Plan
        </h2>
        
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
          gap: '1rem',
          marginBottom: '3rem',
        }}>
          {pricingPlans.map(plan => (
            <div
              key={plan.id}
              onClick={() => setFormData(prev => ({ ...prev, paymentMethod: plan.id }))}
              style={{
                background: formData.paymentMethod === plan.id 
                  ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' 
                  : 'rgba(255,255,255,0.05)',
                border: plan.popular ? '2px solid #f59e0b' : '1px solid rgba(255,255,255,0.1)',
                borderRadius: '1rem',
                padding: '1.5rem',
                cursor: 'pointer',
                position: 'relative',
                transition: 'transform 0.2s',
              }}
            >
              {plan.popular && (
                <div style={{
                  position: 'absolute',
                  top: '-0.75rem',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: '#f59e0b',
                  color: 'white',
                  padding: '0.25rem 0.75rem',
                  borderRadius: '9999px',
                  fontSize: '0.7rem',
                  fontWeight: 'bold',
                  textTransform: 'uppercase',
                }}>
                  Most Popular
                </div>
              )}
              
              <div style={{ color: 'white', textAlign: 'center' }}>
                <h3 style={{ fontSize: '1.125rem', marginBottom: '0.5rem' }}>{plan.name}</h3>
                <div style={{ marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '2rem', fontWeight: 'bold' }}>{plan.price}</span>
                  <span style={{ fontSize: '0.875rem', color: '#94a3b8' }}>{plan.period}</span>
                </div>
                {plan.savings && (
                  <div style={{
                    background: '#22c55e',
                    display: 'inline-block',
                    padding: '0.25rem 0.5rem',
                    borderRadius: '0.25rem',
                    fontSize: '0.75rem',
                    fontWeight: 'bold',
                    marginBottom: '0.75rem',
                  }}>
                    {plan.savings}
                  </div>
                )}
                <div style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>
                  {plan.features.map((f, i) => (
                    <div key={i}>✓ {f}</div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Application Form */}
        <div style={{
          background: 'white',
          borderRadius: '1.5rem',
          padding: 'clamp(1.5rem, 4vw, 2.5rem)',
          maxWidth: '600px',
          margin: '0 auto',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        }}>
          <h2 style={{ fontSize: '1.5rem', color: '#1e293b', marginBottom: '0.5rem', textAlign: 'center' }}>
            Apply for Prime
          </h2>
          <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '1.5rem', textAlign: 'center' }}>
            Fill in your details and our team will get in touch
          </p>

          {error && (
            <div style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#dc2626',
              padding: '0.75rem',
              borderRadius: '0.5rem',
              marginBottom: '1rem',
              fontSize: '0.875rem',
            }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.875rem', color: '#374151', marginBottom: '0.375rem', fontWeight: '500' }}>
                Full Name *
              </label>
              <input
                type="text"
                name="fullName"
                value={formData.fullName}
                onChange={handleChange}
                required
                placeholder="Enter your full name"
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.5rem',
                  fontSize: '1rem',
                  outline: 'none',
                  boxSizing: 'border-box',
                  color: '#1e293b',
                }}
              />
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.875rem', color: '#374151', marginBottom: '0.375rem', fontWeight: '500' }}>
                Email Address *
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                required
                placeholder="your.email@example.com"
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.5rem',
                  fontSize: '1rem',
                  outline: 'none',
                  boxSizing: 'border-box',
                  color: '#1e293b',
                }}
              />
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.875rem', color: '#374151', marginBottom: '0.375rem', fontWeight: '500' }}>
                Phone Number *
              </label>
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                required
                placeholder="+1 234 567 8900"
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.5rem',
                  fontSize: '1rem',
                  outline: 'none',
                  boxSizing: 'border-box',
                  color: '#1e293b',
                }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', color: '#374151', marginBottom: '0.375rem', fontWeight: '500' }}>
                  Target Band Score
                </label>
                <select
                  name="targetBand"
                  value={formData.targetBand}
                  onChange={handleChange}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.5rem',
                    fontSize: '1rem',
                    outline: 'none',
                    background: 'white',
                    color: '#1e293b',
                  }}
                >
                  <option value="">Select...</option>
                  <option value="5.5">5.5</option>
                  <option value="6.0">6.0</option>
                  <option value="6.5">6.5</option>
                  <option value="7.0">7.0</option>
                  <option value="7.5">7.5</option>
                  <option value="8.0">8.0+</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', color: '#374151', marginBottom: '0.375rem', fontWeight: '500' }}>
                  Exam Date
                </label>
                <input
                  type="date"
                  name="examDate"
                  value={formData.examDate}
                  onChange={handleChange}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.5rem',
                    fontSize: '1rem',
                    outline: 'none',
                    boxSizing: 'border-box',
                    color: '#1e293b',
                  }}
                />
              </div>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.875rem', color: '#374151', marginBottom: '0.375rem', fontWeight: '500' }}>
                Current English Level
              </label>
              <select
                name="currentLevel"
                value={formData.currentLevel}
                onChange={handleChange}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.5rem',
                  fontSize: '1rem',
                  outline: 'none',
                  background: 'white',
                  color: '#1e293b',
                }}
              >
                <option value="">Select your level...</option>
                <option value="beginner">Beginner (Band 3-4)</option>
                <option value="intermediate">Intermediate (Band 4.5-5.5)</option>
                <option value="upper-intermediate">Upper Intermediate (Band 6-6.5)</option>
                <option value="advanced">Advanced (Band 7+)</option>
              </select>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontSize: '0.875rem', color: '#374151', marginBottom: '0.375rem', fontWeight: '500' }}>
                Your Goals (Optional)
              </label>
              <textarea
                name="goals"
                value={formData.goals}
                onChange={handleChange}
                placeholder="Tell us about your IELTS goals - why do you need this score? (e.g., university admission, immigration, work)"
                rows={3}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.5rem',
                  fontSize: '1rem',
                  outline: 'none',
                  resize: 'vertical',
                  boxSizing: 'border-box',
                  fontFamily: 'inherit',
                  color: '#1e293b',
                }}
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                width: '100%',
                padding: '1rem',
                background: isSubmitting 
                  ? '#9ca3af' 
                  : 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '0.75rem',
                fontSize: '1.125rem',
                fontWeight: 'bold',
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                transition: 'transform 0.2s',
              }}
            >
              {isSubmitting ? 'Submitting...' : '🚀 Submit Application'}
            </button>

            <p style={{
              textAlign: 'center',
              fontSize: '0.75rem',
              color: '#9ca3af',
              marginTop: '1rem',
            }}>
              By submitting, you agree to our terms of service and privacy policy.
              <br />We'll never share your information with third parties.
            </p>
          </form>
        </div>

        {/* Testimonials Carousel */}
        <div style={{ marginTop: '3rem', textAlign: 'center', overflow: 'hidden' }}>
          <h2 style={{ color: 'white', fontSize: '1.5rem', marginBottom: '0.5rem' }}>
            🌍 Trusted by Thousands of Students Worldwide
          </h2>
          <p style={{ color: '#94a3b8', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
            {testimonials.length}+ success stories from {testimonials.length} countries
          </p>
          
          {/* Carousel Container */}
          <div 
            ref={carouselRef}
            style={{
              display: 'flex',
              transition: 'transform 0.5s ease-in-out',
              transform: `translateX(-${carouselIndex * carouselStep}px)`,
            }}
          >
            {/* Duplicate testimonials for infinite loop effect */} 
            {[...testimonials, ...testimonials].map((testimonial, idx) => (
              <div
                key={idx}
                style={{
                  minWidth: `${carouselCardWidth}px`,
                  width: `${carouselCardWidth}px`,
                  marginRight: '20px',
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: '1rem',
                  padding: '1.25rem',
                  color: 'white',
                  flexShrink: 0,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  <div style={{
                    width: '3rem',
                    height: '3rem',
                    background: `linear-gradient(135deg, hsl(${(idx * 37) % 360}, 70%, 50%) 0%, hsl(${(idx * 37 + 40) % 360}, 70%, 40%) 100%)`,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 'bold',
                    fontSize: '1.25rem',
                  }}>
                    {testimonial.name.charAt(0)}
                  </div>
                  <div style={{ textAlign: 'left', flex: 1 }}>
                    <div style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>{testimonial.name}</div>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{testimonial.country}</div>
                  </div>
                  <div style={{
                    background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                    padding: '0.25rem 0.5rem',
                    borderRadius: '0.375rem',
                    fontSize: '0.75rem',
                    fontWeight: 'bold',
                  }}>
                    Band {testimonial.score}
                  </div>
                </div>
                <p style={{ fontSize: '0.875rem', color: '#e2e8f0', margin: 0, fontStyle: 'italic', lineHeight: 1.5 }}>
                  "{testimonial.text}"
                </p>
              </div>
            ))}
          </div>
          
          {/* Carousel Navigation Dots */}
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '0.5rem',
            marginTop: '1.5rem',
            flexWrap: 'wrap',
          }}>
            {Array.from({ length: Math.min(10, Math.ceil(testimonials.length / 3)) }).map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCarouselIndex(idx * 3)}
                style={{
                  width: '0.75rem',
                  height: '0.75rem',
                  borderRadius: '50%',
                  border: 'none',
                  background: Math.floor(carouselIndex / 3) === idx ? '#22c55e' : 'rgba(255,255,255,0.3)',
                  cursor: 'pointer',
                  transition: 'background 0.3s',
                }}
              />
            ))}
          </div>
          
          {/* Manual Navigation Arrows */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginTop: '1rem' }}>
            <button
              onClick={() => setCarouselIndex(prev => Math.max(0, prev - 3))}
              style={{
                background: 'rgba(255,255,255,0.1)',
                border: '1px solid rgba(255,255,255,0.2)',
                color: 'white',
                width: '2.5rem',
                height: '2.5rem',
                borderRadius: '50%',
                cursor: 'pointer',
                fontSize: '1rem',
              }}
            >
              ←
            </button>
            <button
              onClick={() => setCarouselIndex(prev => Math.min(testimonials.length - 1, prev + 3))}
              style={{
                background: 'rgba(255,255,255,0.1)',
                border: '1px solid rgba(255,255,255,0.2)',
                color: 'white',
                width: '2.5rem',
                height: '2.5rem',
                borderRadius: '50%',
                cursor: 'pointer',
                fontSize: '1rem',
              }}
            >
              →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default IeltsPrime;
