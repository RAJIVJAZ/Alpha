'use client';

import * as React from 'react';
import { LogOut, RefreshCw, Send } from 'lucide-react';
import { reopenApp, signOut } from '../components/app-shell';
import { Button } from '../components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/card';
import { DocumentInput, Field, Input, Select } from '../components/form';
import { ErrorNotice } from '../components/layout';
import { Spinner } from '../components/misc';
import { StatusNote } from '../components/status';
import { api, ApiError, uploadMedia } from '../lib/api';
import { humanize } from '../lib/format';
import { useApi, useApiMutation, useSession } from '../lib/hooks';
import {
  applicationBody,
  canReapply,
  DOCUMENTS,
  documentsFor,
  motorised,
  vehicleNumber,
  VEHICLES,
  type ApplicationForm,
} from './application';
import type { RiderProfile } from './types';

/**
 * Where a signed-in account without the RIDER role lands in rider-web: apply
 * to deliver (POST riders/onboarding), then follow the review until approved.
 */
export function RiderApplication() {
  const me = useApi<RiderProfile>('riders/me');
  const session = useSession();
  // riders/me answers 404 until the first application
  const notApplied = me.error instanceof ApiError && me.error.status === 404;
  const profile = notApplied ? null : me.data;
  const reason = profile?.rejectionReason;

  let body: React.ReactNode;
  if (me.isLoading || session.isLoading) body = <Spinner />;
  else if (profile === undefined) body = <ErrorNotice error={me.error} />;
  else
    body = (
      <>
        {profile === null ? (
          <p className="text-sm text-muted-foreground">
            Tell us about yourself and your vehicle and add photos of your documents. We review
            every application and you can follow it here.
          </p>
        ) : profile.status === 'PENDING_APPROVAL' && reason ? (
          <StatusNote status="CHANGES_REQUESTED">
            <p>Changes requested: {reason}</p>
            <p>Update your application below and submit it again.</p>
          </StatusNote>
        ) : profile.status === 'PENDING_APPROVAL' ? (
          <StatusNote status="PENDING_APPROVAL">
            <p>Your application is under review. You will see the decision here.</p>
            <Button variant="outline" loading={me.isFetching} onClick={() => void me.refetch()}>
              <RefreshCw /> Check status
            </Button>
          </StatusNote>
        ) : profile.status === 'REJECTED' ? (
          <StatusNote status="REJECTED">
            <p>Your application was not approved: {reason ?? 'no reason given'}</p>
            <p>You can fix it and apply again below.</p>
          </StatusNote>
        ) : profile.status === 'ACTIVE' ? (
          <StatusNote status="APPROVED">
            <p>You are approved as a FoodGrid delivery partner.</p>
            <Button onClick={() => void reopenApp()}>Start delivering</Button>
          </StatusNote>
        ) : (
          <StatusNote status={profile.status}>
            <p>
              Your rider account is {humanize(profile.status).toLowerCase()}. Contact FoodGrid
              support.
            </p>
          </StatusNote>
        )}
        {profile === null || canReapply(profile) ? (
          // a Google-only account has no number, and the service refuses it (PHONE_REQUIRED)
          session.data?.phone ? (
            <ApplicationFields previous={profile} defaultName={session.data.name ?? ''} />
          ) : (
            <p role="status" className="text-sm">
              Sign out and sign in with your mobile number to apply. Customers and restaurants call
              riders on it.
            </p>
          )
        ) : null}
      </>
    );

  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle className="text-xl">Deliver with FoodGrid</CardTitle>
        <CardDescription>Apply to become a FoodGrid delivery partner.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        {body}
        <Button variant="ghost" onClick={() => void signOut()}>
          <LogOut /> Sign out
        </Button>
      </CardContent>
    </Card>
  );
}

/** The application form; `previous` pre-fills a resubmission and keeps its documents. */
function ApplicationFields({
  previous,
  defaultName,
}: {
  previous: RiderProfile | null;
  defaultName: string;
}) {
  const [form, setForm] = React.useState<ApplicationForm>(() => ({
    name: previous?.name ?? defaultName,
    city: previous?.city ?? '',
    vehicleType: previous && VEHICLES[previous.vehicleType] ? previous.vehicleType : 'SCOOTER',
    vehicleNumber: vehicleNumber(previous?.vehicleNumber ?? ''),
    licenseNumber: previous?.licenseNumber ?? '',
    upiId: previous?.upiId ?? '',
  }));
  const [files, setFiles] = React.useState<Record<string, File>>({});
  const sent = Object.fromEntries((previous?.documents ?? []).map((d) => [d.kind, d.url]));
  const set =
    (key: keyof ApplicationForm, clean = (v: string) => v) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [key]: clean(e.target.value) }));

  const submit = useApiMutation(
    async () => {
      const kinds = documentsFor(form.vehicleType);
      const missing = kinds.find((k) => !files[k] && !sent[k]);
      if (missing) throw new Error(`Add a photo: ${DOCUMENTS[missing]}`);
      const documents: Record<string, string> = {};
      for (const kind of kinds) {
        const file = files[kind];
        documents[kind] = file ? await uploadMedia(file, 'kyc') : sent[kind]!;
      }
      return api.post('riders/onboarding', applicationBody(form, documents));
    },
    { invalidate: ['riders/me'], success: 'Application sent. We will review it soon.' },
  );

  return (
    <form className="grid gap-4" onSubmit={(e) => (e.preventDefault(), submit.mutate())}>
      <Field label="Full name (as on your ID)">
        <Input
          required
          maxLength={80}
          autoComplete="name"
          value={form.name}
          onChange={set('name')}
        />
      </Field>
      <Field label="City you will deliver in">
        <Input
          required
          maxLength={60}
          autoComplete="address-level2"
          value={form.city}
          onChange={set('city')}
        />
      </Field>
      <Field label="Vehicle">
        <Select value={form.vehicleType} onChange={set('vehicleType')}>
          {Object.entries(VEHICLES).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
      {motorised(form.vehicleType) ? (
        <>
          <Field label="Vehicle number" hint="As on the number plate, like KA01AB1234">
            <Input
              required
              pattern="[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}"
              title="Like KA01AB1234"
              value={form.vehicleNumber}
              onChange={set('vehicleNumber', vehicleNumber)}
            />
          </Field>
          <Field label="Driving licence number">
            <Input
              required
              maxLength={20}
              value={form.licenseNumber}
              onChange={set('licenseNumber', (v) => v.toUpperCase())}
            />
          </Field>
        </>
      ) : null}
      <Field label="UPI ID for payouts (optional)" hint="Like name@okaxis">
        <Input
          pattern="[\w.\-]+@\w+"
          title="Like name@okaxis"
          value={form.upiId}
          onChange={set('upiId')}
        />
      </Field>
      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">Documents (photo or PDF)</legend>
        {documentsFor(form.vehicleType).map((kind) => (
          <DocumentInput
            key={kind}
            label={DOCUMENTS[kind]!}
            file={files[kind]}
            sent={!!sent[kind]}
            onChange={(file) => setFiles((f) => ({ ...f, [kind]: file }))}
          />
        ))}
      </fieldset>
      <Button type="submit" size="lg" loading={submit.isPending}>
        <Send /> {previous ? 'Submit again' : 'Submit application'}
      </Button>
    </form>
  );
}
