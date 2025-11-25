# 3. Organisationsoverblik

Efter login bliver du sendt til organisationsoverblik-siden.

Denne side giver et samlet overblik over alle tilknyttede underorganisationer og afdelinger. Siden tilpasser sig dynamisk baseret på din brugerrolle og de tilhørende rettigheder.

Som **organisationsadministrator** har du adgang til yderligere funktioner:
* **Tilføj Underorganisation**: Opret nye underorganisationer.
* **Administrer Brugere**: Håndter oprettelse og administration af brugere i hele organisationen.
* **Globale Indstillinger**: Konfigurer indstillinger, der gælder for hele organisationen.

Både **organisations-** og **underorganisationsadministratorer** kan desuden oprette, omdøbe og slette afdelinger inden for deres respektive områder.

---

## 3.1 Medarbejdervisning

Som **medarbejder** viser overblikket de afdelinger, du er tilknyttet. For at tilgå en specifik afdeling skal du blot klikke på **Vælg**.

![Visning for en medarbejder med adgang til to afdelinger](/docs/docs_images/da/employee_da_select_sub_org.png)

---

## 3.2 Underorganisationsadministrator

Som **underorganisationsadministrator** har du fuld adgang til alle afdelinger inden for din underorganisation samt muligheden for at oprette underorganisatoins skabeloner. Dine administrative rettigheder omfatter:
* Oprettelse af nye afdelinger.
* Ændring af afdelingers navne.
* Sletning af eksisterende afdelinger.
* Oprettelse af underorganisations skabeloner

![Visning for en underorganisationsadministrator](/docs/docs_images/da/suborg_admin_da_select_sub_org.png)

---

## 3.3 Organisationsadministrator

Som **organisationsadministrator** har du den højeste adgangsrettighed og kan se og administrere samtlige underorganisationer og afdelinger. Du besidder de samme rettigheder som en underorganisationsadministrator for alle underorganisationer og kan derudover oprette og slette selve underorganisationerne.

![Visning for en organisationsadministrator](/docs/docs_images/da/org_admin_da_select_sub_org.png)

### 3.3.1 Brugeradministration

En central funktion for organisationsadministratorer er muligheden for at administrere systemets brugere.

#### 3.3.1.1 Opret Brugere

For at oprette en ny bruger, klik på **Administrer Brugere** og derefter **Tilføj Bruger**.

![Knap til at tilføje en ny bruger](/docs/docs_images/da/add_user_da.png)

I dialogboksen, der vises, skal du tildele brugeren en rolle og de nødvendige tilknytninger:

* **Medarbejder**: Kræver valg af både en underorganisation og en specifik afdeling.
* **Underorganisationsadministrator**: Kræver kun valg af en underorganisation.
* **Organisationsadministrator**: Kræver ingen yderligere valg, da rollen giver adgang til hele systemet.

![Dialogboks til oprettelse af bruger med forskellige roller](/docs/docs_images/da/add_user_modal_da.png)

#### 3.3.1.2 Administrer Eksisterende Brugere

For at redigere rettigheder for eksisterende brugere, klik på **Administrer Brugere** og vælg **Administrer Eksisterende Brugere**.

![Knap til at administrere eksisterende brugere](/docs/docs_images/da/manage_existing_users_da.png)

Dette åbner et administrationspanel, hvor du kan se en komplet oversigt over alle brugere i organisationen.

![Panel til administration af eksisterende brugere](/docs/docs_images/da/manage_existing_users_modal_da.png)

I dette panel kan du udføre følgende handlinger:

* **Fjern en rolle**: Vælg den pågældende bruger i sidemenuen for at se vedkommendes nuværende roller. Klik på **Fjern Adgang** ud for den rolle, du ønsker at fjerne.
* **Tildel en ny rolle**: Under sektionen "Tilføj Nyt Organisationsmedlemskab" vælger du den relevante underorganisation og rolle. For rollen **Medarbejder** skal du også specificere en afdeling. Klik på **+** ikonet for at tilføje den nye rolle.
* **Fjern en bruger permanent**: For at fjerne en bruger helt fra organisationen, skal du vælge brugeren og klikke på **Fjern fra organisation**. Alternativt vil en bruger blive fjernet fra organisationen, hvis alle deres roller og adgange manuelt fjernes.

### 3.3.2 Globale Indstillinger

Som organisationsadministrator kan du tilgå siden "Globale indstillinger" for at konfigurere organisationens fælles udseende og ressourcer. Her kan du:

* Angive standardfarver og skrifttyper, der anvendes ved oprettelse af indhold.
* Oprette og vedligeholde skabeloner, som afdelinger kan bruge.
* Administrere globale mediefiler, fx logoer.

Ændringerne gælder på tværs af underorganisationer og afdelinger.

For at tilgå globale indstillinger, tryk på knappen "Globale Indstillinger".

![Global Settings](/docs/docs_images/da/global_settings_da.png)

Efter at have trykket på knappen, vil du se en ny navigationsmenu med mulighederne:

* Farveskema
* Skrifttyper
* Kategorier og tags
* Skabeloner
* Mediefiler

Som standard lander du på siden "Skrifttyper og farver".


#### 3.3.2.1 Skrifttyper og farver

Siden **Skrifttyper og farver** lader dig administrere organisationens fælles skrifttyper og farveskema. Indholdet er opdelt i to sektioner: et til skrifttyper og et til farver. 

![Manage Colors and Fonts](/docs/docs_images/da/manage_fonts_and_colors.png)

Sektionen **Brugerdefinerede Skrifttyper** viser alle uploadede skrifttyper. Tryk på **Tilføj Font** for at uploade en ny skrifttype med tilhørende filer og visningsnavn. Eksisterende skrifttyper kan omarrangeres via træk-og-slip, hvilket ændrer hvilken rækkefølge de bliver vist i inden i editoren. Skrifttyper kan redigeres eller slettes via handlingsknapperne.

Under **Tekstboks værktøjslinjeindstillinger** bestemmer du, hvilke formateringsknapper brugerne ser i teksteditoren. Slå for eksempel fed, kursiv, understregning eller vægtvalg til og fra, så værktøjslinjen matcher organisationens skrifttyper. 
Hvis jeres organisation bruger fonts med hardcodede indstillinger såsom kursiv eller fed tekst, bør fed tekst og kursiv slås fra. 
Hvis man bruger en moderne variabel font, ala dem man kan downloade hos google fonts, bør man slå "Vis rulleliste for skriftykkelse" til. Hvis man ikke bruger en variabel font, er denne ikke nødvendig. 

Kortet **Brugerdefinerede Farver** håndteres organisationens farver. Klik på **Tilføj Farve** tilføje en ny farve. Farver kan enten defineres ved direkte at indtaste en HEX kode, eller man kan bruge browserens farvevælger.

Tabellen med de eksiterende farver giver en oversigt over organisatoins farver, samt en drag-and-drop funktion til at ændre rækkefølgen af farverne. Rækkefølger i tabellen afgør hvilken rækkefølge farver bliver vist i editoren.

Alle skrifttyper og farver, du konfigurerer her, bliver tilgængelige i organisationens indholdsredigering.

Undgå helst at navngive skrifttyper med tal og specialtegn. De vil oftest virke men tegn som ! eller : kan godt forvirre browseren, og fortolke skrifttypen som en CSS regel ved en fejl.

#### 3.3.2.2 Administrer kategorier og tags

På denne side kan organisationsadministratorer opsætte de tilgængelige kategorier og tags i systemet. Tags bruges eksempelvis i slideshows og uploadede billeder. Brugere i systemet kan kun vælge tags eller kategorier, der er defineret her. Hver ting har én kategori, men kan have flere tags.

For at tilføje en kategori, tryk på "+ Tilføj Kategori". Indtast navnet på kategorien og tryk på Gem. Det samme gælder for tags. Du kan søge i dine eksisterende tags eller kategorier i søgefeltet. For at redigere et tag eller en kategori, tryk på 'Rediger', og en dialogboks vil åbne, hvor du kan indtaste det nye navn. For at slette en kategori eller et tag, tryk på 'Slet'.


![Kategorier og tags](/docs/docs_images/da/manage_tags_and_cats_da.png)e underorganisationer og afdelinger. Siden tilpasser sig dynamisk baseret på din brugerrolle og de tilhørende rettigheder.

#### 3.3.2.3 Skabeloner

På skabelons siden kan organisationsadministratorer opsætte de tilgængelige skabeloner for organisationen. Disse skabeloner er dem som underorganisations skabeloner bliver bygget ud fra.
Slideshows bliver så til sidst bygget udfra underorganisations skabelonerne. Skabelons editoren har næsten alle de samme features den normalle editor til at redigere slideshows og interaktivt indhold, så derfor vil dokumentationen for at oprette skabeloner i stedet være skrevet under afsnittet [Opret Indhold](#opret_indhold). 


![Templates](/docs/docs_images/da/templates_da.png)
