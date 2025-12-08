import "./style.scss";

import { gettext, translateHTML } from "../../utils/locales";
translateHTML();
import { token } from "../../utils/utils";
import { BASE_URL } from "../../utils/constants";

let templates = null;

await fetch(`${BASE_URL}/api/global-templates/`, {
  method: "GET",
  headers: {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  },
})
  .then((response) => {
    if (!response.ok) {
      throw new Error(`Status ${response.status}: ${response.statusText}`);
    }
    return response.json();
  })
  .then((data) => {
    //templates = data.templates;
    console.log(data)
    templates = data;
  })
  .catch((error) => {
    console.error("Error fetching templates from store:", error);
  });

console.log("Templates from store:", templates);
