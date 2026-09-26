import type { Metadata } from "next";
import { asc } from "drizzle-orm";
import { CreateUserForm } from "@/components/system/users/create-user-form";
import { UserActions } from "@/components/system/users/user-actions";
import { Badge } from "@/components/ui/badge";
import { Section, SectionContent, SectionDescription, SectionHeader, SectionTitle } from "@/components/ui/section";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { emailEnabled } from "@/lib/email/settings";

export const metadata: Metadata = { title: "Users" };
export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const me = await requireAdmin();
  const canEmail = await emailEnabled();
  const users = await db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      username: schema.users.username,
      email: schema.users.email,
      role: schema.users.role,
      banned: schema.users.banned,
      mustChangePassword: schema.users.mustChangePassword,
    })
    .from(schema.users)
    .orderBy(asc(schema.users.username));

  return (
    <div className="flex flex-col gap-8">
      <div className="max-w-2xl">
        <h1 className="text-3xl text-accent">Users</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everyone who can sign in. Admins manage accounts and settings; they can&rsquo;t see into anyone else&rsquo;s
          collection.
        </p>
      </div>

      <Section>
        <SectionHeader>
          <SectionTitle>Accounts</SectionTitle>
        </SectionHeader>
        <SectionContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Username</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id} data-username={user.username}>
                  <TableCell>{user.name}</TableCell>
                  <TableCell className="font-mono text-xs">{user.username}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell className="capitalize">{user.role}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {user.banned ? <Badge>Deactivated</Badge> : <Badge>Active</Badge>}
                      {user.mustChangePassword ? <Badge>Temporary password</Badge> : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    {user.id === me.id ? (
                      <span className="text-xs text-muted-foreground">You</span>
                    ) : (
                      <UserActions
                        userId={user.id}
                        username={user.username}
                        role={user.role}
                        active={!user.banned}
                        canEmail={canEmail}
                      />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </SectionContent>
      </Section>

      <Section>
        <SectionHeader>
          <SectionTitle>New account</SectionTitle>
          <SectionDescription>
            Rickhouse can email an invitation, once email is set up. Otherwise it makes up a temporary password for you
            to hand over.
          </SectionDescription>
        </SectionHeader>
        <SectionContent>
          <CreateUserForm canInvite={canEmail} />
        </SectionContent>
      </Section>
    </div>
  );
}
