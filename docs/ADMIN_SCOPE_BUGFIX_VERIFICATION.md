# Admin scope bugfix – verification checklist

Admin pages are no longer scoped by the **Operational Scope** selector. They use a separate **Admin Filter** (All / Boutique / Region / Group) stored in `UserPreference.adminFilterJson`.

## 1) Operational scope does not filter Admin pages

- [ ] Log in as ADMIN.
- [ ] Change **Operational Scope** (sidebar) to a single boutique (e.g. S02).
- [ ] Go to **Admin → Memberships**.
- [ ] **Expected:** List shows **all** memberships across all boutiques (or the last-used Admin Filter), not only the boutique selected in Operational Scope.
- [ ] **Expected:** Scope selector is **hidden** on `/admin/*` pages.

## 2) Admin filter applies correctly

- [ ] On **Admin → Memberships**, open the Admin Filter and choose **By boutique** → S02 (or one specific boutique).
- [ ] **Expected:** Table shows only memberships for that boutique.
- [ ] Switch filter back to **All boutiques**.
- [ ] **Expected:** Table shows all memberships again.

## 3) Admin → Employees

- [ ] **Admin → Employees** shows **Admin Filter** and defaults to all employees.
- [ ] Apply Admin Filter by boutique/region/group; list updates accordingly.
- [ ] Table has a **Boutique** column (current assignment).
- [ ] **Change Boutique** opens a modal; changing and saving updates the employee’s boutique and an audit record.

## 4) Admin → Users

- [ ] **Admin → Users** shows **Admin Filter** and list of all users when filter is All.
- [ ] Table shows **Memberships** count and **Primary boutique** per user.
- [ ] Applying Admin Filter (e.g. by boutique) shows only users who have at least one membership in that scope.

## 5) Data model

- [ ] `UserPreference.adminFilterJson` is used only for admin filter; operational scope remains in `scopeJson`.
- [ ] `Employee.boutiqueId` exists; employees have a current boutique; changing it is audited (`EMPLOYEE_CHANGE_BOUTIQUE`).

## 6) No horizontal scroll

- [ ] Admin Memberships, Employees, and Users pages do not introduce horizontal scroll on typical viewports.

## 7) i18n

- [ ] Admin Filter label and options (All boutiques, By boutique, By region, By group) and “Change Boutique” appear in EN and AR when locale is switched.
