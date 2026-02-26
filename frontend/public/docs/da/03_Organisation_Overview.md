# 3. Organisationsoverblik

I dette kapitel vil organisationsoverblik-siden blive introduceret. Denne side bliver brugeren sendt til efter login, hvis de er organisations- eller underorganisationsadministrator, eller hvis de er tilknyttet mere end en afdeling som medarbejder.

Organisationsoverblik-siden giver et samlet overblik over alle tilknyttede underorganisationer og afdelinger. Siden tilpasser sig dynamisk baseret på din brugerrolle og de tilhørende rettigheder.

---

## 3.1 Medarbejdervisning

Som **medarbejder** vises overblikket over de afdelinger, du er tilknyttet. For at tilgå en specifik afdeling skal du blot klikke på **Vælg**.

![Visning for en medarbejder med adgang til to afdelinger](/docs/docs_images/da/employee_da_select_sub_org.png)

---

## 3.2 Underorganisationsadministrator visning

Som **underorganisationsadministrator** har du fuld adgang til alle afdelinger inden for din underorganisation samt muligheden for at oprette underorganisations skabeloner. Dine administrative rettigheder omfatter:
* Oprettelse af nye afdelinger.
* Ændring af afdelingers navne.
* Sletning af eksisterende afdelinger.
* Oprettelse af underorganisations skabeloner

![Visning for en underorganisationsadministrator](/docs/docs_images/da/suborg_admin_da_select_sub_org.png)

---

## 3.3 Organisationsadministrator visning

Som **organisationsadministrator** har du den højeste adgangsrettighed og kan se og administrere samtlige underorganisationer og afdelinger. Du besidder de samme rettigheder som en underorganisationsadministrator for alle underorganisationer og kan derudover oprette og slette selve underorganisationerne.

![Visning for en organisationsadministrator](/docs/docs_images/da/org_admin_da_select_sub_org.png)

### 3.3.1 Brugeradministration

En central funktion for organisationsadministratorer er muligheden for at administrere systemets brugere. Her introduceres hvilke muligheder, der er for bruger administration:

<!-- Dette er udkommenteret, da oprettelse af brugere ikke er færdig udviklet endnu -->
<!-- #### 3.3.1.1 Opret Brugere

For at oprette en ny bruger, klik på **Administrer Brugere** og derefter **Tilføj Bruger**.

![Knap til at tilføje en ny bruger](/docs/docs_images/da/add_user_da.png)

I dialogboksen, der vises, skal du tildele brugeren en rolle og de nødvendige tilknytninger:

* **Medarbejder**: Kræver valg af både en underorganisation og en specifik afdeling.
* **Underorganisationsadministrator**: Kræver kun valg af en underorganisation.
* **Organisationsadministrator**: Kræver ingen yderligere valg, da rollen giver adgang til hele systemet.

![Dialogboks til oprettelse af bruger med forskellige roller](/docs/docs_images/da/add_user_modal_da.png) -->

#### 3.3.1.1 Administrer Eksisterende Brugere

For at redigere rettigheder for eksisterende brugere, klik på **Administrer Brugere** og vælg **Administrer Eksisterende Brugere**.

![Knap til at administrere eksisterende brugere](/docs/docs_images/da/manage_existing_users_da.png)

Dette åbner et administrationspanel, hvor du kan se en komplet oversigt over alle brugere i organisationen.

![Panel til administration af eksisterende brugere](/docs/docs_images/da/manage_existing_users_modal_da.png)

I dette panel kan du udføre følgende handlinger:

* **Tildel en ny rolle**: Under sektionen "Tilføj Nyt Underorganisation Medlemskab" vælger du den relevante underorganisation og rolle. For rollen **Medarbejder** skal du også specificere en afdeling. Klik på **+** ikonet for at tilføje den nye rolle.
* **Fjern en rolle**: Vælg den pågældende bruger i sidemenuen for at se vedkommendes nuværende roller. Klik på **Fjern Adgang** ud for den rolle, du ønsker at fjerne.
<!-- Dette er udkommenteret, da fjernelse af brugere ikke er færdig udviklet endnu -->
<!-- * **Fjern en bruger permanent**: For at fjerne en bruger helt fra organisationen, skal du vælge brugeren og klikke på **Fjern fra organisation**. Alternativt vil en bruger blive fjernet fra organisationen, hvis alle deres roller og adgange manuelt fjernes. -->
