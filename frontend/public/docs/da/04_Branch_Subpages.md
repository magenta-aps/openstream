# 4. Afdelingsundersider
Hvis du kun har tilknyttet én afdeling, vil du automatisk blive sendt herhen når du logger ind. Hvis du har adgang til flere afdelinger, så kan du se hvordan du vælger afdeling her: [Medarbejdervisning](#03_Organisation_Overview#31-medarbejdervisning). 


Efter at have valgt en afdeling, vil navigations menuen ændre sig. Nu vil navigations menuen vise en knap hvor der står hvilken afdeling du har valgt. Denne knap kan trykkes på for at skifte afdeling. Udover det, så vil der stå følgende menupunkter:

* Dashboard: En overbliks side over hvad der foregår på afdelingen lige nu
* Indhold: Denne side er en oversigts side over oprettet indhold. Herfra kan man åbne, oprette og slette indhold.
* Afspilningslister: En side hvor man kan sammensætte slideshows til afspilningslister.
* Administrer Skærme: På denne sider tilkobler man skærme til systemet og tildeler dem indhold, samt et kalendersystem hvor man kan planlægge indhold.

![Afdelings Navigationsmenu](/docs/docs_images/da/branch_navbar_da.png)

## 4.1 Dashboard
Denne første side der bliver vist efter man har åbnet en afdeling, er dashboardet. På denne side, kan man se de senest redigerede indhold og afspilningslister, og åbne dem hurtigt uden at skulle gå ind Indholds siden og finde det frem manuelt. Samt er der en oversigt over hvilket indhold bliver afspillet på skærmene lige nu, og hvad der er planlagt som det næste.


![Afdelings Navigationsmenu](/docs/docs_images/da/dashboard_da.png)

## 4.2 Indhold

Denne side viser en oversigt over oprettet indhold og giver mulighed for at oprette, redigere, duplikere eller slette indhold.

### 4.2.1 Find eksisterende indhold

Du kan søge efter indhold via navn, tags eller kategori. I venstre sidepanel kan du filtrere på kategorier og tags. Tabellens kolonner kan sorteres ved at klikke på overskrifterne "Navn", "Tilstand", "Kategori" eller "Tags" — klik igen vender sorteringen.

![Find Eksisterende Indhold](/docs/docs_images/da/find_existing_content_da.png)

### 4.2.2 Rediger eksisterende indhold

![Rediger Eksisterende Indhold](/docs/docs_images/da/edit_existing_content_da.png)

#### 4.2.2.1 Rediger metadata

For at ændre metadata (f.eks. navn, kategori eller tags) klik på blyant-ikonet ved det felt, du vil redigere. Ændringerne gemmes, når du bekræfter redigeringen.

#### 4.2.2.2 Åbn indhold

Klik på "Åbn" under handlinger for at åbne indholdet i editoren. Editoren bliver forklaret i afsnittet [Opret Indhold](#opret-indhold)

#### 4.2.2.3 Dupliker indhold

Klik på "Dupliker" for at lave en kopi. Den nye kopi får samme navn som originalen med "(Kopi)" tilføjet.

#### 4.2.2.4 Slet indhold

Klik på "Slet" under handlinger og bekræft for at fjerne indholdet. Bemærk: Hvis indholdet allerede er tildelt skærme, vil de blive tomme, når indholdet slettes.

### 4.2.3 Opret indhold

Klik på "Tilføj indhold" øverst til højre for at oprette nyt indhold.

![Tilføj indhold](/docs/docs_images/da/add_content_da.png)

Efter klik åbnes en dialog med flere indstillinger.


![Tilføj indhold](/docs/docs_images/da/add_content_modal_da.png)

##### Navngiv indhold

Indtast navnet i tekstfeltet "Navn".

##### Vælg tilstand

Vælg mellem to tilstande: "Slideshow" og "Interaktiv". Tilstanden vælges i en dropdown og kan ikke ændres efter oprettelse.

Slideshow
I denne tilstand bygger du et slideshow med slides, hvor du indsætter indhold, vælger rækkefølge og angiver visningstid for hver slide. Se afsnittet om slideshow for detaljer.

Interaktiv
I denne tilstand opretter du interaktive sider, fx til touchskærme. Elementer kan konfigureres som knapper, der navigerer mellem sider. Se afsnittet om interaktivt indhold for detaljer.

##### Aspect ratio

Vælg det format, indholdet skal vises i (fx 16:9 til bredformat eller 9:16 til højformat). Indhold skal oprettes med henblik på hvilket størrelsesforhold den skærm(e) som skal vise indholdet er.

##### Gem

Klik på "Opret indhold" når du er færdig. Efter oprettelsen får du mulighed for enten at gå direkte til editoren eller blive på oversigtssiden.

## 4.3 Afspilningslister

![Tilføj indhold](/docs/docs_images/da/playlists_da.png)

Denne side bruges til at oprette og administrere afspilningslister bestående af slideshows.
Formålet er at samle flere slideshows i en rækkefølge, som derefter kan tildeles skærme eller planlægges i tidsplaner.

Layout og hovedfunktioner
- Venstre sidepanel viser alle oprettede afspilningslister i en liste. Knappen "Tilføj Playlist" øverst åbner en modal til oprettelse af en ny afspilningsliste.
- Når en afspilningsliste er valgt, viser hovedområdet navnet på den valgte playlist og to handlinger: "Omdøb Afspilningsliste" og "Tilføj indhold til afspilningsliste".
- Hvis ingen playlist er valgt, vises en vejledende tekst "Please select a Slideshow Playlist to edit" i hovedområdet.

Redigeringssektion
- Når en afspilningsliste er valgt, kan du se og redigere rækkefølgen af slideshows i tabelformat. Tabellen viser hver række med forløb (slideshow), position og en kolonne til handlinger (fx fjern eller flyt).
- Rækkefølge kan ændres ved hjælp af træk-og-slip i tabellen — du kan dermed justere positionen af hvert slideshow i playlisten.


## 4.4 Håndter skærme

![Håndter Skærme](/docs/docs_images/da/manage_displays.png)

Siden "Håndter skærme" er opdelt i et sidepanel til venstre og en kalender til højre. Sidepanelet bruges til at oprette og vedligeholde skærmgrupper og skærme, mens kalenderen viser planlagt indhold for de grupper du markerer.

**Begreber**
- En *gruppe* samler ét eller flere displays, der skal vise det samme indhold og deler samme billedformat. Du styrer standardindhold, planlagte afspilninger og metadata på gruppeniveau.

- En *skærm* (display) er den fysiske klient, som registreres i OpenStream. Skærmen bliver tilknyttet med et bestemt størrelesforhold, og det er brugerens ansvar at indsætte det rigtigt størrelsesforhold i OpenStream når skærmen bliver registreret.
Efter en skærm er blevet registreret, skal den tilknyttes en gruppe for at vise indhold.

### 4.4.1 Sidepanel: grupper og skærme
#### 4.4.1.1 Tilføj skærmgruppe
Tryk på **Tilføj skærmgruppe** for at oprette en ny skærmgruppe. I dialogen vælger du navn, billedformat (aspect ratio) og standardindhold. Når du klikker på en gruppe i listen, åbnes de tilknyttede modalvinduer til at omdøbe, ændre format eller justere standardindhold.

![Tilføj Gruppe](/docs/docs_images/da/add_group_btn.png)
![Tilføj Gruppe](/docs/docs_images/da/add_group.png)

#### 4.4.1.2 Registrer skærm
Vælg **Registrer Skærm** for at åbne registreringsdialogen og kopiere enten registrerings-URL eller API-nøgle til eksterne værktøjer som OS2BorgerPC.

![Tilføj Gruppe](/docs/docs_images/da/register_screen.png)

![Add Screen](/docs/docs_images/da/screen_registration_dialog.png)

Efter en skærm er blevet registret, vil den automatisk blive vist i bunden af den venstre sidemenu i "Inaktive Skærme". For at give skærmen noget indhold skal den bare trækkes op i en skærmgruppe som har indhold tilknyttet.

![Inactive Screens](/docs/docs_images/da/inactive_screen.png)


### 4.4.2 Standardindhold for grupper
- Hver gruppe har standardindhold, som afspilles når der ikke er planlagte afvigelser. Vælg mellem enkelt slideshows/interaktivt indhold eller en samlet slideshow-playlist.
- Redigér standardindholdet for en gruppe ved at klikke på blyantsikonet ved siden af gruppen.

![Inactive Screens](/docs/docs_images/da/edit_group.png)

### 4.4.3 Planlæg indhold i kalenderen
- Kalenderen fylder hovedområdet og viser alle planlagte afspilninger for de valgte grupper.
- Brug **Tilføj planlagt indhold** eller træk musen hen over kalenderen til engangsbegivenheder på bestemte datoer og tidspunkter.Vælg om indholdet skal erstatte standardindholdet eller afspilles i kombination.
![Scheduled Content](/docs/docs_images/da/add_scheduled_content_btn.png)
![Scheduled Content](/docs/docs_images/da/add_scheduled_content_modal.png)

- Brug **Tilføj tilbagevendene indhold** til tilbagevendende planlægning, f.eks. hver mandag kl. 10:00-12:00. Eksisterende begivenheder kan redigeres eller slettes via de tilsvarende edit-modalvinduer. Recurring content kan tilføjes i kombinations tilstand eller overskrivningstilstand.
- Det er muligt at kombinere flere ting i kalenderen på samme tid.

![Recurring Content](/docs/docs_images/da/recurring_content.png)
![Recurring Content](/docs/docs_images/da/recurring_content_modal.png)


### 4.4.4 Vedligeholdelse af skærme
- Vælg samme billedformat på skærmen og i gruppen, ellers blokerer programmet for handlingen.
- Hvis et display skal skifte billedformat, fjern det fra sin nuværende gruppe og tilføj den til tilbage til "Inaktive Skærme". Når skærmen er inaktiv kan du ændre dens størrelsesforhold.