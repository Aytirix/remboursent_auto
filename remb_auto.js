// ==UserScript==
// @name         Ekoi remboursement
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  try to take over the world!
// @author       You
// @include     /^https?://([a-z]+\.)?([a-z]+\.[a-z]+).*vieworder.*$/
// @icon         https://www.google.com/s2/favicons?sz=64&domain=ekoi.fr
// @grant        none
// ==/UserScript==

//Le programme détectera uniquement les retours ouverts avec le statut "Confirmé - En attente du colis" et vérifiera si le produit est bien coché pour avoir un remboursement ou un avoir.
//S'il y a que des avoirs à faire un avoir, sinon faire un remboursement.
//Si tous les produits payant ont été remboursé, alors on rembourse les frais de port

(function () {
    'use strict';
    class retour {
        constructor() {
            this.id = null;
            this.avoir_ou_remboursement = null;
            this.debug = false; // Si true : ne passe pas le/les retour(s) en Retour terminé
            this.copy = true;
            this.montant_total_remb = 0;
        }

        exposeObjectToConsole() {
            // Exposer l'objet obj_remb_auto en tant que propriété de window
            window.obj_remb_auto = this;
        }

        start() {
            // Capturez la valeur de 'this' pour la classe 'retour'
            var self = this;
            var newInput = document.createElement("input");
            // Définissez les attributs de l'élément en utilisant la syntaxe littérale
            newInput.className = "btn";
            newInput.style.margin = "0 0.5em 0.5em 0";
            newInput.type = "button";
            newInput.value = "Remboursement automatique";
            newInput.onclick = function () {
                self.rechercher_retour().then(retours_en_attente => {
                    if (retours_en_attente != false) {
                        self.analyse_retour(retours_en_attente).then(produit_a_rembourser => {
                            if (produit_a_rembourser != false) {
                                console.log("Produit à rembourser : ");
                                console.log(produit_a_rembourser);
                                self.Remboursement_Automatique(produit_a_rembourser);
                                //Modifier le bouton partialRefund pour mettre potentiellement à jour le status de la commande
                                var partialRefundButton = document.querySelector('#start_products > div > form > div.panel > div.partial_refund_fields > button');
                                if (partialRefundButton) {
                                    partialRefundButton.onclick = function () {
                                        var t = self.update_statut_commande(obj_remb_auto);
                                    };
                                }
                                console.log("montant total à rembourser : " + self.montant_total_remb);
                                if (self.copy) {
                                    self.montant_total_remb.toFixed(2);
                                    self.copyToClipboard(self.montant_total_remb);
                                }
                                self.exposeObjectToConsole();
                            }
                        });
                    }
                });
            };
            // Insérez le bouton après le bouton 'Ajouter un Retour vide'
            try {
                var existingInput = document.querySelector("input[value='Ajouter un Retour vide']");
                existingInput.insertAdjacentElement('afterend', newInput);
            } catch (e) {
                console.log("Une erreur est survenu lors e l'initiation du remboursement auto");
                console.log(e);
            }
        }

        // rechercher les retours en attente
        // return : liste de dictionnaire qui contient les retours en attente
        // format : [{retour: <tr>, info: <tr>}]
        async rechercher_retour() {
            var retours = document.querySelectorAll('#form-configuration > div > div.table-responsive-row.clearfix > table tbody tr[class^=" "]');

            // Filtrer les retours en attente
            var retours_en_attente = [];
            for (var i = 0; i < retours.length; i++) {
                var retour = retours[i];
                var td4 = retour.querySelector('td:nth-child(4) select option[selected]').innerText;

                // Si le retour n'est pas en attente on l'ignore
                if (td4 != "Confirmé - En attente du colis") {
                    continue;
                }

                // Si l'élément tr qui est juste après le retour à la classe returnDetail alors c'est un retour qui est ouvert
                // S'il y a pas de retour ouvert sa fera une exception et on l'ignore
                try {
                    var tr = retour.nextElementSibling;
                    if (tr.className == "returnDetail") {
                        var retour_info = { retour: retour, info: tr };
                        retours_en_attente.push(retour_info);
                    }
                } catch (e) {
                }
            }

            // Si aucun retour en attente
            if (retours_en_attente.length == 0) {
                alert("Aucun retour à rembourser a été trouvé");
                return false;
            }

            return retours_en_attente;
        }

        // Analyser les retours en attente
        // param : retours_en_attente : liste de dictionnaire qui contient les retours en attente
        // format : [{retour: <tr>, info: <tr>}]
        // return : liste de dictionnaire qui contient les produits à rembourser
        // format : [{id: 123, Designation: "Brille EKOI PERSOEVO4 Weiß Revo Rot Kat3 - Größe : one size", quantite: 1}]
        async analyse_retour(retours_en_attente) {
            var produit_a_rembourser = [];
            for (var i = 0; i < retours_en_attente.length; i++) {
                var retour = retours_en_attente[i].info;
                var produits = retour.querySelectorAll('table > tbody > tr');

                // Si le retour est vide on l'ignore
                if (produits[0].querySelector('td').getAttribute("class") == "list-empty") {
                    continue;
                }

                // parcourir les produits du retour
                var nb_produits_remb = 0;
                for (var j = 0; j < produits.length; j++) {
                    var produit = produits[j];
                    var td5 = produit.querySelector('td:nth-child(5) select option[selected]').innerText;

                    // Si le produit n'est pas un remboursement ou un avoir on l'ignore
                    if (td5 != "Remboursement" && td5 != "Avoir") {
                        continue;
                    }

                    // Vérifier que le produit est bien coché pour avoir un remboursement ou un avoir
                    var td1 = produit.querySelector('td:nth-child(9) > a').className;
                    if (td1 != "list-action-enable ajax_table_link action-enabled") {
                        continue;
                    }

                    // Récupérer les informations du produit
                    var id = produit.querySelector('td:nth-child(1)').innerText;
                    var designation = produit.querySelector('td:nth-child(2)').innerText;
                    var quantite = produit.querySelector('td:nth-child(3)').innerText;

                    // S'il y a que des avoirs faire un avoir, sinon faire un remboursement
                    var souhait = produit.querySelector('td:nth-child(5) > select > option[selected]').innerText;
                    if (this.avoir_ou_remboursement == null || this.avoir_ou_remboursement == "Avoir") {
                        this.avoir_ou_remboursement = souhait;
                    }

                    // Ajouter le produit à la liste des produits à rembourser
                    produit_a_rembourser.push({ id: id, designation: designation, quantite: quantite });
                    nb_produits_remb += quantite;
                }

                if (nb_produits_remb != 0) {
                    // ajouter le montant au total le montant à rembourser :
                    // this.montant_total_remb += parseFloat(retours_en_attente[i].retour.querySelector("td:nth-child(8)").innerText.replace(',', '.')) || 0;
                    // Passer le retour en Retour terminé
                    await this.retour_termine(retours_en_attente[i].retour);
                } else {
                    retours_en_attente[i].retour.querySelector('td:nth-child(7) a').click();
                }
            }

            // Si aucun produit à rembourser
            if (produit_a_rembourser.length == 0) {
                alert("Aucun produit à rembourser a été trouvé");
                return false;
            }


            reloadReturnPanel();
            return produit_a_rembourser;
        }

        // Méthode pour passer un retour en Retour terminé
        // param : retour : le retour à passer en Retour terminé
        async retour_termine(retour) {
            if (this.debug) {
                return;
            }

            // Passer le select en Retour terminé
            var select = retour.querySelector('td:nth-child(4) select');
            // Passer le select en Retour terminé
            select.value = "5";
            // Récupérer le token du retour
            var input = select.getAttribute("onchange");
            var token = new RegExp("'([^']+)'");
            var match = input.match(token);
            // Si le token est trouvé on passe le retour en Retour terminé
            if (match && match[1]) {
                this.rpChangeOrderReturnStatusCustom(retour, match[1]);
            } else {
                console.log("Impossible de trouver le token pour passer le retour en Retour terminé retour : " + retour);
            }
        }

        // Méthode pour passer un retour en Retour terminé sans actualiser le le panel
        async rpChangeOrderReturnStatusCustom(obj, token) {
            var id_order_return = obj.querySelector('td:nth-child(1)').innerText;
            var select = obj.querySelector('td:nth-child(4) select').value;
            $.get("index.php?controller=AdminRetourProduitConfiguration&ajax=1&action=changeReturnStatus&token=" + token + "&id_order_return=" + id_order_return + "&status=" + select, function (data) {
                if (data === "1")
                    console.log("Statut correctement mis à jour !");
            });
        }

        async Remboursement_Automatique(produit_a_rembourser) {
            // Cliquez sur le bouton remboursement partiel
            try {
                document.querySelector('#desc-order-partial_refund').click();
            } catch (e) {

                var btn_a = document.createElement("a");

                // Configuration des attributs de la balise <a>
                btn_a.id = "desc-order-partial_refund";
                btn_a.className = "btn btn-default";
                btn_a.href = "#refundForm";

                // Création de la balise <i> et ajout de la classe
                var i = document.createElement("i");
                i.className = "icon-exchange";

                // Ajout de la balise <i> à la balise <a>
                btn_a.appendChild(i);

                // Ajout du texte directement après la balise <i>
                var text = document.createTextNode(" Remboursement partiel");
                btn_a.appendChild(text);

                var elem_add = document.querySelector('[class="span label label-inactive"]');
                elem_add.insertAdjacentElement('afterend', btn_a);
                document.querySelector('#desc-order-partial_refund').click();
            }

            // Récupéré tous les éléments de la commande
            var elements = document.querySelectorAll('#orderProducts > tbody > tr[class="product-line-row"]');

            var compteur_produit = [];
            var total_remboursement = { payant: { total: 0, deja_rembourse: 0, rembourse: 0 }, gratuit: { total: 0, deja_rembourse: 0, rembourse: 0 } };
            var produit_total_compte = [];
            // Parcourir les produits à rembourser
            for (var i = 0; i < produit_a_rembourser.length; i++) {
                compteur_produit[i] = [];
                // Parcourir les produits de la commande
                for (var j = 0; j < elements.length; j++) {
                    var remb = produit_a_rembourser[i];
                    var prod = elements[j];
                    compteur_produit[i][j] = 0;

                    // Tester si le produit est gratuit ou payant
                    var test = parseFloat(prod.querySelector('[class="total_product"]').innerText.replace(",", ".").trim());
                    var deja_rembourser = +(prod.querySelector('td:nth-child(8)').innerText.match(/\d+,\d+|\d+/) || ['0'])[0];
                    if (!produit_total_compte.includes(j)) {
                        if (test == 0) {
                            total_remboursement.gratuit.deja_rembourse += deja_rembourser;
                            total_remboursement.gratuit.total += parseInt(prod.querySelector('[class^="product_quantity_show"]').innerText, 10);
                        } else {
                            total_remboursement.payant.deja_rembourse += deja_rembourser;
                            total_remboursement.payant.total += parseInt(prod.querySelector('[class^="product_quantity_show"]').innerText, 10);
                        }
                        produit_total_compte.push(j);
                    }

                    if (test != 0) {
                        var elem_remb = prod.querySelector('#orderProducts > tbody > tr > td.partial_refund_fields.current-edit > div > div.col-lg-4 > div');
                    } else {
                        var elem_remb = prod.querySelector('#orderProducts > tbody > tr > td.partial_refund_fields.current-edit > div > div.col-lg-12 > div');
                    }

                    // Vérifier que la quantité est supérieur à la quantité à rembourser
                    // récupéré la quantité total commandé de ce produit
                    //Si exception, le produit a déjà été remboursé, donc on l'ignore
                    try {
                        var quantite = elem_remb.querySelector('div').innerText;
                    } catch (e) {
                        continue;
                    }
                    var match = quantite.match(/\/ (\d+)/);
                    // Vérifier que le match est correct
                    if (!match && !match[1]) {
                        console.log("Impossible de trouver la quantité du produit : ");
                        console.log(produit_a_rembourser);
                        continue;
                    }
                    var inputElem = elem_remb.querySelector('input');
                    var remb_qtt = parseInt(inputElem.value, 10) + parseInt(remb.quantite, 10);
                    // Si la quantité à rembourser est supérieur à la quantité total commandé - la quantité déjà remboursé
                    if (match[1] < remb_qtt) {
                        continue;
                    }

                    // Comparer l'id
                    var id = prod.querySelector('td:nth-child(2)').innerText;
                    if (id == remb.id) {
                        // ajoutez +100 au compteur pour le produit
                        compteur_produit[i][j] += 100;
                    } else {
                        continue;
                    }

                    // Comparer la désignation
                    var designation = prod.querySelector('[class="productName"]').innerText;
                    designation = this.preprocessString(designation);
                    compteur_produit[i][j] = this.levenshteinDistance(designation, remb.designation);
                }

                // Trouver le produit qui a le plus de points
                var max = 0;
                var index = 0;
                var countSameMax = 0; // Compteur pour les produits avec le même nombre de points maximum
                for (var u = 0; u < compteur_produit[i].length; u++) {
                    if (compteur_produit[i][u] > max) {
                        max = compteur_produit[i][u];
                        index = u;
                        countSameMax = 1; // Réinitialiser le compteur si un autre produit a un nombre de points maximum plus grand
                    } else if (compteur_produit[i][u] === max) {
                        // Compter seulement si c'est un produit payant
                        var test = parseFloat(elements[u].querySelector('[class="total_product"]').innerText.replace(",", ".").trim());
                        if (test != 0) {
                            countSameMax++; // Augmenter le compteur si un autre produit a le même nombre de points maximum
                        }
                    }
                }


                //Si plusieurs produits ont le même nombre de points maximum alors on ne peut pas savoir quel est le bon produit à rembourser
                if (countSameMax > 1) {
                    alert("Impossible de savoir quel produit rembourser : " + remb.designation);
                    continue;
                }

                // Récupérer le produit
                prod = elements[index];
                // Mettre à jour la quantité à rembourser
                if (this.avoir_ou_remboursement == "Remboursement") {
                    var productPriceText = prod.querySelector('[class="product_price_show"]').textContent; // Obtenez le texte complet, par exemple "59,99 €"
                    var productPriceValue = parseFloat(productPriceText.replace(/[^\d.,]/g, '').replace(',', '.')); // Extrait le montant numérique
                    this.montant_total_remb = this.montant_total_remb + productPriceValue * parseInt(remb.quantite, 10);
                }
                inputElem = prod.querySelector('td:nth-child(15) input');
                remb_qtt = parseInt(inputElem.value, 10) + parseInt(remb.quantite, 10);
                prod.querySelector('td:nth-child(15) input').value = remb_qtt;
                // Tester si le produit est gratuit ou payant
                var test = parseFloat(prod.querySelector('[class="total_product"]').innerText.replace(",", ".").trim());
                // ajouter le produit à la liste des produits remboursés
                if (test != 0) {
                    total_remboursement.payant.rembourse += parseInt(remb.quantite, 10);
                } else {
                    total_remboursement.gratuit.rembourse += parseInt(remb.quantite, 10);
                }
            }

            // Si le this.avoir_ou_remboursement est avoir alors on clique sur le bouton avoir
            if (this.avoir_ou_remboursement == "Avoir") {
                document.querySelector('#generateDiscountRefund').click();
            }

            // Si la différence le total de produit à rembourser et le total de produit remboursé est différent de 0
            // alors il y a des produits qui n'ont pas été remboursé automatiquement
            if (total_remboursement.payant.rembourse + total_remboursement.gratuit.rembourse != produit_a_rembourser.length) {
                alert("Attention, il y a " + (produit_a_rembourser.length - total_remboursement.payant.rembourse + total_remboursement.gratuit.rembourse) + " produit(s) qui n'ont pas été remboursé(s) automatiquement");
                return false;
            }

            // Si tous les produits payant ont été remboursé, alors on rembourse les frais de port si tous les produits payant ont été remboursé
            if (total_remboursement.payant.total == total_remboursement.payant.rembourse + total_remboursement.payant.deja_rembourse) {
                var frais_port = document.querySelector('[id="total_shipping"] [class="amount text-right nowrap"]').innerText.replace("€", "").replace(",", ".").trim();
                frais_port = parseFloat(frais_port);
                // Si les frais de port sont supérieur à 0
                if (frais_port > 0) {
                    document.querySelector(' [name="partialRefundShippingCost"]').value = frais_port;
                    if (this.avoir_ou_remboursement == "Remboursement") {
                        this.montant_total_remb += frais_port;
                    } else {
                        this.montant_total_remb = 0;
                    }
                }
            }
        }

        // Comparer deux chaines de caractères a la map de taille
        // param : a : chaine de caractère 1
        // param : b : chaine de caractère 2
        // return : nombre de points
        levenshteinDistance(a, b) {
            const sizeMapping = { "XS": 0, "S": 1, "M": 2, "L": 3, "XL": 4, "XXL": 5, "XXXL": 6, "Unique": 7, "S / M": 8, "L / XL": 9 };

            function extractSize(str) {
                const match = str.split(/[:\-]/);
                return match[match.length - 1].trim() || "";
            }

            const sizeA = extractSize(a);
            const sizeB = extractSize(b);
            const sizeDifference = Math.abs((sizeMapping[sizeA] || 0) - (sizeMapping[sizeB] || 0));

            const matrix = Array.from({ length: a.length + 1 }, (_, i) => i)
                .map((_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : 0)));

            for (let i = 1; i <= a.length; i++) {
                for (let j = 1; j <= b.length; j++) {
                    const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1;
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j] + 1, // Deletion
                        matrix[i][j - 1] + 1, // Insertion
                        matrix[i - 1][j - 1] + substitutionCost // Substitution
                    );
                }
            }

            var ret = matrix[a.length][b.length];
            // Adjusting the distance by the size difference
            ret += sizeDifference;
            // Inverting the distance to have more points if the distance is small
            return Math.max(a.length, b.length) - ret;
        }

        // Convertir la taille dans les produits de la commande au format du retour (ex : 2XL => XXL)
        // param : str : la chaine de caractère à convertir
        // return : la chaine de caractère converti
        preprocessString(str) {
            const mapping = {
                '2XL': 'XXL',
                '3XL': 'XXXL',
            };
            for (const key in mapping) {
                const regex = new RegExp(key, 'g');
                str = str.replace(regex, mapping[key]);
            }
            return str;
        }

        update_statut_commande(obj_remb_auto) {
            if (obj_remb_auto.avoir_ou_remboursement !== "Avoir") {
                return;
            }

            function getParameterByName(name, url) {
                if (!url) url = window.location.href;
                name = name.replace(/[\[\]]/g, '\\$&');
                var regex = new RegExp('[?&]' + name + '(=([^&#]*)|&|#|$)');
                var results = regex.exec(url);
                if (!results) return null;
                if (!results[2]) return '';
                return decodeURIComponent(results[2].replace(/\+/g, ' '));
            }

            var token = getParameterByName('token');
            var id_order = getParameterByName('id_order');

            var formData = new FormData();
            formData.append('id_order_state', '73');
            formData.append('id_order', id_order);
            formData.append('submitState', ''); // Ajoutez "submitState" avec une valeur vide

            var xhr = new XMLHttpRequest();

            var url = 'index.php?controller=AdminOrders&vieworder&token=' + token;

            xhr.open('POST', url, true);

            xhr.onreadystatechange = function () {
                if (xhr.readyState === 4 && xhr.status === 200) {
                    console.log(xhr.responseText);
                }
            };
            xhr.send(formData);
        }

        copyToClipboard(text) {
            if (navigator.clipboard) {
                navigator.clipboard.writeText(text).then(function () {
                    console.log('Texte copié dans le presse-papiers : ' + text);
                }).catch(function (err) {
                    console.error('Erreur lors de la copie dans le presse-papiers : ', err);
                });
            } else {
                // Utiliser une approche de secours pour les navigateurs qui ne prennent pas en charge l'API Clipboard
                var textArea = document.createElement("textarea");
                textArea.value = text;
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
                console.log('Texte copié dans le presse-papiers : ' + text);
            }
        }
    }


    try {
        const obj_remb_auto = new retour();
        obj_remb_auto.start();
    } catch (e) {
        alert("Une erreur est survenu lors du remboursement automatique");
        console.log(e);
    }
}

)();