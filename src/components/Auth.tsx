import { useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { supabase } from '../lib/supabaseClient';

interface AuthProps {
  onAuthSuccess: () => void;
  onNavigateHome?: () => void;
}

export function Auth({ onAuthSuccess, onNavigateHome }: AuthProps) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      onAuthSuccess();
    } catch (err) {
      // Surface a minimal error UI
      alert((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#1a1a1a] flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        <div className="bg-[#f5f5f5] rounded-3xl p-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2 cursor-pointer" onClick={onNavigateHome}>
              <BarChart3 className="w-6 h-6" />
              <span className="font-semibold">SwiftSpace</span>
            </div>
            <Button
              variant="ghost"
              onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
            >
              {mode === 'signin' ? 'Create account' : 'Have an account? Sign in'}
            </Button>
          </div>

          <h1 className="text-3xl mb-1">{mode === 'signin' ? 'Sign in' : 'Create account'}</h1>
          <p className="text-gray-600 mb-6">
            {mode === 'signin'
              ? 'Access your dashboard by signing in.'
              : 'Get started in minutes — it’s free.'}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm text-gray-700 mb-2 inline-block">Email</label>
              <Input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="bg-white"
              />
            </div>
            <div>
              <label className="text-sm text-gray-700 mb-2 inline-block">Password</label>
              <Input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="bg-white"
              />
            </div>

            <Button
              type="submit"
              className="w-full bg-[#030213] text-white hover:bg-gray-800"
              disabled={loading}
            >
              {loading ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
            </Button>
          </form>

          <div className="text-xs text-gray-500 mt-4 text-center">
            By continuing, you agree to our Terms and Privacy Policy.
          </div>
        </div>
      </div>
    </div>
  );
}


