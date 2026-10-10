import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Stethoscope, LogIn } from 'lucide-react';
import { toast } from 'sonner';

const getUzbekError = (message: string): string => {
  const lower = message.toLowerCase();
  if (lower.includes('invalid login credentials') || lower.includes('invalid_credentials')) {
    return 'Email yoki parol noto\'g\'ri';
  }
  if (lower.includes('email not confirmed')) {
    return 'Email tasdiqlanmagan. Pochtangizni tekshiring.';
  }
  if (lower.includes('network') || lower.includes('fetch')) {
    return 'Tarmoq xatosi. Internet aloqangizni tekshiring.';
  }
  return message;
};

const Login = () => {
  const { signIn, user, role, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const showDebug = searchParams.get('debug') === '1';

  // Redirect authenticated users away from login — send to / which handles role-based routing
  useEffect(() => {
    if (authLoading) return;
    if (user) {
      navigate('/', { replace: true });
    }
  }, [user, authLoading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await signIn(email, password);
      if (error) {
        toast.error("Kirish xatoligi", { description: getUzbekError(error.message) });
      }
      // If no error, onAuthStateChange will update user/role and the useEffect above redirects
    } catch {
      toast.error("Tarmoq xatosi", { description: "Serverga ulanib bo'lmadi" });
    }
    setLoading(false);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Yuklanmoqda...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-24 h-24 rounded-2xl bg-white shadow-md p-2 mb-2 border border-border overflow-hidden">
            <img src="/logo-icon.png" alt="DR.BAYNIYAZOV" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-2xl font-bold tracking-wide text-foreground">DR.BAYNIYAZOV</h1>
          <p className="text-muted-foreground text-sm font-medium">Stomatologiya Klinikasi</p>
        </div>

        <Card className="border shadow-lg">
          <CardHeader className="pb-4">
            <h2 className="text-lg font-semibold text-center text-foreground">Tizimga kirish</h2>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Elektron pochta</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="pochta@misol.uz"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Parol</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                <LogIn className="w-4 h-4 mr-2" />
                {loading ? 'Kirish...' : 'Kirish'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          Klinika xodimlari uchun yopiq tizim.<br />
          Kirish uchun administrator bilan bog'laning.
        </p>

        {showDebug && (
          <div className="rounded border border-muted bg-muted/50 p-3 text-xs font-mono space-y-1">
            <p>authLoading: {String(authLoading)}</p>
            <p>isAuthenticated: {String(!!user)}</p>
            <p>userId: {user?.id?.slice(0, 8) ?? 'null'}</p>
            <p>role: {role ?? 'null'}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Login;
