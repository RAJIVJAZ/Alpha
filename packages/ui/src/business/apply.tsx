'use client';

import * as React from 'react';
import { LogOut, Plus, RefreshCw, Send } from 'lucide-react';
import type { TenantMembershipSummary } from '@foodgrid/types';
import { reopenApp, signOut, switchTenant } from '../components/app-shell';
import { Button } from '../components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/card';
import { DocumentInput, Field, Input, Select } from '../components/form';
import { ErrorNotice } from '../components/layout';
import { Spinner } from '../components/misc';
import { StatusBadge, StatusNote } from '../components/status';
import { api, uploadMedia } from '../lib/api';
import { humanize } from '../lib/format';
import { useApi, useApiMutation, useSession } from '../lib/hooks';
import {
  BUSINESS_TYPES,
  businessBody,
  canResubmit,
  DOCUMENTS,
  documentsFor,
  kycBody,
  needsFssai,
  sentDocuments,
  type BusinessForm,
  type BusinessIds,
} from './application';

/** GET tenants/current; notes, PAN and documents only for roles that manage settings. */
interface Business extends BusinessIds {
  id: string;
  type: string;
  status: string;
  name: string;
  rejectionReason?: string | null;
  kycDocuments?: { kind?: string; url?: string }[];
}

/**
 * Where a signed-in account without an approved business of `types` lands in
 * a business app: register one (POST tenants), then follow the review of the
 * selected business until it is approved.
 */
export function BusinessApplication({ types }: { types: string[] }) {
  const session = useSession();
  const [adding, setAdding] = React.useState(false);
  const mine = session.data?.memberships.filter((m) => types.includes(m.tenantType)) ?? [];
  const active = mine.find((m) => m.tenantId === session.data?.activeTenantId);
  const kinds = types.map((t) => BUSINESS_TYPES[t]!.toLowerCase());
  const noun = kinds.length > 1 ? `${kinds.slice(0, -1).join(', ')} or ${kinds.at(-1)}` : kinds[0];

  let body: React.ReactNode;
  if (session.isLoading) body = <Spinner />;
  else if (active) body = <ApplicationStatus membership={active} />;
  else if (mine.length && !adding)
    body = (
      <>
        <p className="text-sm text-muted-foreground">Choose the business to open.</p>
        <ul className="grid gap-2">
          {mine.map((m) => (
            <li key={m.tenantId}>
              <Button
                variant="outline"
                className="w-full justify-between"
                onClick={() => void switchTenant(m.tenantId)}
              >
                <span className="truncate">{m.tenantName}</span>
                <StatusBadge status={m.tenantStatus} />
              </Button>
            </li>
          ))}
        </ul>
        <Button variant="ghost" onClick={() => setAdding(true)}>
          <Plus /> Register another business
        </Button>
      </>
    );
  else
    body = (
      <>
        <p className="text-sm text-muted-foreground">
          Tell us about your business and add photos or PDFs of its documents. We review every
          application and you can follow it here.
        </p>
        <BusinessFields
          types={types}
          defaults={{ phone: session.data?.phone ?? '', email: session.data?.email ?? '' }}
        />
      </>
    );

  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle className="text-xl">Your business on FoodGrid</CardTitle>
        <CardDescription>Register your {noun} to sell on FoodGrid.</CardDescription>
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

function ApplicationStatus({ membership }: { membership: TenantMembershipSummary }) {
  const current = useApi<Business>('tenants/current');
  const t = current.data;
  if (current.isLoading) return <Spinner />;
  if (!t) return <ErrorNotice error={current.error} />;
  const reason = t.rejectionReason;
  return (
    <>
      {t.status === 'ACTIVE' ? (
        <StatusNote status="APPROVED">
          <p>{t.name} is approved.</p>
          <Button onClick={() => void reopenApp()}>Open dashboard</Button>
        </StatusNote>
      ) : t.status === 'REJECTED' ? (
        <StatusNote status="REJECTED">
          <p>
            {t.name} was not approved: {reason ?? 'no reason given'}
          </p>
        </StatusNote>
      ) : t.status === 'PENDING_APPROVAL' && reason ? (
        <StatusNote status="CHANGES_REQUESTED">
          <p>Changes requested: {reason}</p>
        </StatusNote>
      ) : t.status === 'PENDING_APPROVAL' ? (
        <StatusNote status="PENDING_APPROVAL">
          <p>{t.name} is under review. You will see the decision here.</p>
          <Button
            variant="outline"
            loading={current.isFetching}
            onClick={() => void current.refetch()}
          >
            <RefreshCw /> Check status
          </Button>
        </StatusNote>
      ) : (
        <StatusNote status={t.status}>
          <p>
            {t.name} is {humanize(t.status).toLowerCase()}. Contact FoodGrid support.
          </p>
        </StatusNote>
      )}
      {canResubmit(t) ? (
        membership.permissions.includes('settings:manage') ? (
          <>
            <p className="text-sm">Fix your application below and submit it again.</p>
            <BusinessFields types={[t.type]} tenant={t} />
          </>
        ) : (
          <p className="text-sm">Ask the owner of {t.name} to update the application.</p>
        )
      ) : null}
    </>
  );
}

/**
 * The application form. With `tenant` it resubmits that business's KYC
 * (identifiers and documents; documents sent earlier are kept) instead of
 * registering a new business.
 */
function BusinessFields({
  types,
  tenant,
  defaults,
}: {
  types: string[];
  tenant?: Business;
  defaults?: { phone: string; email: string };
}) {
  const [form, setForm] = React.useState<BusinessForm>(() => ({
    type: tenant?.type ?? types[0]!,
    name: '',
    legalName: tenant?.legalName ?? '',
    pan: tenant?.pan ?? '',
    gstin: tenant?.gstin ?? '',
    fssaiLicense: tenant?.fssaiLicense ?? '',
    email: defaults?.email ?? '',
    phone: defaults?.phone ?? '',
    addressLine1: '',
    city: '',
    state: '',
    pincode: '',
  }));
  const [files, setFiles] = React.useState<Record<string, File>>({});
  const sent = sentDocuments(tenant?.kycDocuments);
  const set =
    (key: keyof BusinessForm, clean = (v: string) => v) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [key]: clean(e.target.value) }));
  const upper = (v: string) => v.toUpperCase();

  const submit = useApiMutation(
    async () => {
      const kinds = documentsFor(form);
      const missing = kinds.find((k) => !files[k] && !sent[k]);
      if (missing) throw new Error(`Add a photo or PDF: ${DOCUMENTS[missing]}`);
      const documents: Record<string, string> = {};
      for (const kind of kinds) {
        const file = files[kind];
        documents[kind] = file ? await uploadMedia(file, 'kyc') : sent[kind]!;
      }
      if (tenant) return api.post('tenants/current/kyc', kycBody(form, tenant, documents));
      const created = await api.post<{ id: string }>('tenants', businessBody(form, documents));
      // select the new business, so the page shows its review
      await switchTenant(created.id);
    },
    {
      invalidate: ['tenants/current'],
      success: 'Application sent. We will review it soon.',
    },
  );

  return (
    <form className="grid gap-4" onSubmit={(e) => (e.preventDefault(), submit.mutate())}>
      {!tenant ? (
        <>
          {types.length > 1 ? (
            <Field label="Type of business">
              <Select value={form.type} onChange={set('type')}>
                {types.map((t) => (
                  <option key={t} value={t}>
                    {BUSINESS_TYPES[t]}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          <Field label="Business name" hint="The name customers and buyers see">
            <Input
              required
              maxLength={120}
              autoComplete="organization"
              value={form.name}
              onChange={set('name')}
            />
          </Field>
        </>
      ) : null}
      <Field label="Legal name (optional)" hint="As on your PAN or GST registration">
        <Input maxLength={160} value={form.legalName} onChange={set('legalName')} />
      </Field>
      <Field label="PAN">
        <Input
          required
          pattern="[A-Z]{5}[0-9]{4}[A-Z]"
          title="Like ABCDE1234F"
          value={form.pan}
          onChange={set('pan', upper)}
        />
      </Field>
      <Field label="GSTIN (optional)" hint="Leave empty if the business is not registered for GST">
        <Input
          pattern="[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]"
          title="15 characters, like 29ABCDE1234F1Z5"
          value={form.gstin}
          onChange={set('gstin', upper)}
        />
      </Field>
      <Field
        label={needsFssai(form.type) ? 'FSSAI licence number' : 'FSSAI licence number (optional)'}
        hint="14 digits, on your FSSAI licence or registration"
      >
        <Input
          required={needsFssai(form.type)}
          inputMode="numeric"
          pattern="\d{14}"
          title="14 digits"
          value={form.fssaiLicense}
          onChange={set('fssaiLicense', (v) => v.replace(/\D/g, ''))}
        />
      </Field>
      {!tenant ? (
        <>
          <Field label="Address">
            <Input
              required
              maxLength={200}
              autoComplete="street-address"
              value={form.addressLine1}
              onChange={set('addressLine1')}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="City">
              <Input
                required
                maxLength={80}
                autoComplete="address-level2"
                value={form.city}
                onChange={set('city')}
              />
            </Field>
            <Field label="State">
              <Input
                required
                maxLength={80}
                autoComplete="address-level1"
                value={form.state}
                onChange={set('state')}
              />
            </Field>
            <Field label="PIN code">
              <Input
                required
                inputMode="numeric"
                pattern="\d{6}"
                title="6 digits"
                autoComplete="postal-code"
                value={form.pincode}
                onChange={set('pincode', (v) => v.replace(/\D/g, ''))}
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Business phone (optional)">
              <Input
                type="tel"
                maxLength={20}
                autoComplete="tel"
                value={form.phone}
                onChange={set('phone')}
              />
            </Field>
            <Field label="Business email (optional)">
              <Input type="email" autoComplete="email" value={form.email} onChange={set('email')} />
            </Field>
          </div>
        </>
      ) : null}
      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">Documents (photo or PDF)</legend>
        {documentsFor(form).map((kind) => (
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
        <Send /> {tenant ? 'Submit again' : 'Submit application'}
      </Button>
    </form>
  );
}
