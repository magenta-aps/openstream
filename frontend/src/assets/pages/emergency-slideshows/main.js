import "./style.scss";
import {
    translateHTML,
    fetchUserLangugage,
    gettext,
} from "../../utils/locales";
import { initOrgUrlRouting, makeActiveInNav } from "../../utils/utils";

document.addEventListener("DOMContentLoaded", async () => {
    initOrgUrlRouting();
    fetchUserLangugage();
    translateHTML();
    makeActiveInNav("/emergency-slideshows");
});
