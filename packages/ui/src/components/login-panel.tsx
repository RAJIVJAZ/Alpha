'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from './button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './card';
import { Field, Input } from './form';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './menu';

type Mode = 'otp' | 'password';

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`/api/auth/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin' });
  const json = (await res.json().catch(() => ({}))) as { message?: string | string[]; details?: { errors?: string[] } } & T;
  if (!res.ok) {
    const msg = Array.isArray(json.message) ? json.message.join(', ') : json.details?.errors?.join(', ') ?? json.message ?? 'Sign-in failed';
    throw new Error(msg);
  }
  return json;
}

/**
 * Sign-in card used by every app: phone OTP and/or email + password. Talks to
 * the app's /api/auth/* routes, which set httpOnly session cookies.
 */
export function LoginPanel({ title, description, modes = ['otp', 'password'] }: { title: string; description?: string; modes?: Mode[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') && params.get('next')!.startsWith('/') ? params.get('next')! : '/';
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [phone, setPhone] = React.useState('');
  const [code, setCode] = React.useState('');
  const [sent, setSent] = React.useState<{ phone: string; devCode?: string } | null>(null);
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const done = () => {
    router.replace(next);
    router.refresh();
  };

  const otp = (
    <div className="grid gap-4">
      {!sent ? (
        <form className="grid gap-4" onSubmit={(e) => (e.preventDefault(), void run(async () => setSent(await post('otp-request', { phone }))))}>
          <Field label="Mobile number" hint="We'll send a 6-digit code by SMS">
            <Input type="tel" inputMode="tel" autoComplete="tel" placeholder="98765 43210" value={phone} onChange={(e) => setPhone(e.target.value)} required />
          </Field>
          <Button type="submit" loading={busy}>
            Send code
          </Button>
        </form>
      ) : (
        <form className="grid gap-4" onSubmit={(e) => (e.preventDefault(), void run(async () => (await post('otp-verify', { phone, code }), done())))}>
          <Field label={`Code sent to ${sent.phone}`} hint={sent.devCode ? `Development code: ${sent.devCode}` : undefined}>
            <Input inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} required autoFocus />
          </Field>
          <Button type="submit" loading={busy}>
            Verify and sign in
          </Button>
          <Button type="button" variant="link" onClick={() => (setSent(null), setCode(''))}>
            Use a different number
          </Button>
        </form>
      )}
    </div>
  );

  const pwd = (
    <form className="grid gap-4" onSubmit={(e) => (e.preventDefault(), void run(async () => (await post('password', { email, password }), done())))}>
      <Field label="Email">
        <Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </Field>
      <Field label="Password">
        <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </Field>
      <Button type="submit" loading={busy}>
        Sign in
      </Button>
    </form>
  );

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="grid gap-4">
        {modes.length > 1 ? (
          <Tabs defaultValue={modes[0]}>
            <TabsList className="grid w-full grid-cols-2">
              {modes.includes('otp') ? <TabsTrigger value="otp">Mobile OTP</TabsTrigger> : null}
              {modes.includes('password') ? <TabsTrigger value="password">Email</TabsTrigger> : null}
            </TabsList>
            <TabsContent value="otp">{otp}</TabsContent>
            <TabsContent value="password">{pwd}</TabsContent>
          </Tabs>
        ) : modes[0] === 'otp' ? (
          otp
        ) : (
          pwd
        )}
        {error ? (
          <p role="alert" className="rounded-md border border-status-critical/30 bg-status-critical/10 px-3 py-2 text-sm">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** Full-page centered layout for /login. */
export function AuthScreen({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh lg:grid-cols-2">
      <div className="flex items-center justify-center p-6">{children}</div>
      <div className="hidden flex-col justify-end bg-gradient-to-br from-orange-700 to-orange-950 p-12 text-white lg:flex">{aside}</div>
    </main>
  );
}
