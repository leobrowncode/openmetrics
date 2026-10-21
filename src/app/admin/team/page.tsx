import { asc } from "drizzle-orm";
import { ActionForm } from "@/components/admin/ActionForm";
import { Badge, Card, CardHeader, Field, Notice, PageHeader, formatDateTime, inputClass } from "@/components/ui";
import { PASSWORD_MIN_LENGTH, requireAdmin } from "@/server/auth/admin";
import { getDb } from "@/server/db/client";
import { adminUsers } from "@/server/db/schema";
import { addAdminAction, changePasswordAction, removeAdminAction } from "../actions/team";

export default async function TeamPage() {
  const me = await requireAdmin();
  const db = await getDb();
  const admins = await db
    .select({ id: adminUsers.id, email: adminUsers.email, createdAt: adminUsers.createdAt })
    .from(adminUsers)
    .orderBy(asc(adminUsers.createdAt));

  return (
    <>
      <PageHeader
        title="Équipe"
        description="Les administrateurs ont accès à tous les clients, connexions Meta et liens privés. Les clients finaux n'ont pas de compte : ils consultent leurs dashboards via un lien privé."
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Administrateurs" description={`${admins.length} compte(s)`} />
          <ul className="divide-y divide-slate-100">
            {admins.map((admin) => (
              <li key={admin.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div>
                  <p className="flex items-center gap-2 text-sm font-medium text-slate-900">
                    {admin.email} {admin.id === me.userId && <Badge tone="blue">Vous</Badge>}
                  </p>
                  <p className="text-xs text-slate-500">Ajouté le {formatDateTime(admin.createdAt)}</p>
                </div>
                {admin.id !== me.userId && admins.length > 1 && (
                  <ActionForm action={removeAdminAction} hidden={{ userId: admin.id }} submitLabel="Retirer l'accès" variant="danger" />
                )}
              </li>
            ))}
          </ul>
        </Card>

        <div className="space-y-6 self-start">
          <Card>
            <CardHeader title="Ajouter un administrateur" />
            <div className="p-5">
              <ActionForm action={addAdminAction} submitLabel="Ajouter">
                <Field label="E-mail">
                  <input name="email" type="email" required autoComplete="off" className={inputClass} />
                </Field>
                <Field label="Mot de passe initial" hint={`${PASSWORD_MIN_LENGTH} caractères minimum, à changer à la première connexion.`}>
                  <input name="password" type="password" required minLength={PASSWORD_MIN_LENGTH} autoComplete="new-password" className={inputClass} />
                </Field>
              </ActionForm>
            </div>
          </Card>

          <Card>
            <CardHeader title="Changer mon mot de passe" />
            <div className="space-y-3 p-5">
              <ActionForm action={changePasswordAction} submitLabel="Changer le mot de passe">
                <Field label="Mot de passe actuel">
                  <input name="current" type="password" required autoComplete="current-password" className={inputClass} />
                </Field>
                <Field label="Nouveau mot de passe">
                  <input name="next" type="password" required minLength={PASSWORD_MIN_LENGTH} autoComplete="new-password" className={inputClass} />
                </Field>
                <Field label="Confirmation">
                  <input name="confirm" type="password" required minLength={PASSWORD_MIN_LENGTH} autoComplete="new-password" className={inputClass} />
                </Field>
              </ActionForm>
              <Notice tone="blue">
                Après l&apos;installation, changez le mot de passe puis supprimez <code>ADMIN_PASSWORD</code> de
                l&apos;hébergement. Tant que cette variable reste définie, elle réécrit le mot de passe de <code>ADMIN_EMAIL</code> à
                chaque démarrage.
              </Notice>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
