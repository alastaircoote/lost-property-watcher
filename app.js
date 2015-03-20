import Promise from 'bluebird';
import request from 'request';
import XPath from 'xpath';
import XMLDom from 'xmldom';
import fs from 'fs';
import moment from 'moment';

fs = Promise.promisifyAll(fs);
const requestAsync = Promise.promisify(request);

const convertXML = (xml) => {
    let doc = new XMLDom.DOMParser().parseFromString(xml);
    let retObj = {
        categories: {}
    };
    retObj.lostArticles = parseInt(XPath.select('//LostProperty/NumberOfLostArticles/text()',doc).toString(),10);
    retObj.itemsClaimed = parseInt(XPath.select('//LostProperty/NumberOfItemsclaimed/text()',doc).toString(),10);

    let categories = XPath.select('//LostProperty/Category',doc);

    for (let category of categories) {
        let categoryName = category.getAttribute('Category');
       
        let subcategories = XPath.select('SubCategory',category);
        let subcatMapped = {}
        subcategories.forEach((subcat) => {
            let subName = subcat.getAttribute('SubCategory');
            let count = parseInt(subcat.getAttribute('count'),10);

            subcatMapped[subName] = count;

        });
        retObj.categories[categoryName] = subcatMapped


    }
    return retObj;
}

const doCheck = () => {
    requestAsync('http://advisory.mtanyct.info/LPUWebServices/CurrentLostProperty.aspx')
    .spread((res,body) => {
        let results = convertXML(body);
        let todayDate = moment().format('YYYYMMDD');
        let files = ['data/last-result.json','data/' + todayDate + '.json'];
        let responseDate = Date.now()
        Promise.map(files, (file) => {
            return fs.readFileAsync(__dirname + '/' + file)
            .then((contents) => JSON.parse(contents))
            .catch((err) => null)
        }).spread((lastResult,todaysResults) => {
            // No previous result set to compare to, so just save it.
            if (!lastResult) return;

            if (!todaysResults) todaysResults = [];
            for (let category in results.categories) {
                for (let subcat in results.categories[category]) {
                    let count = results.categories[category][subcat];
                    let diff =  count - lastResult.categories[category][subcat];
                    if (diff != 0) {
                        todaysResults.push({
                            event: 'subcategory_change',
                            category: category,
                            subcategory: subcat,
                            diff: diff,
                            new_total: count,
                            timestamp: responseDate
                        });
                    }
                }
            }

            let lostArticlesDiff = results.lostArticles - lastResult.lostArticles
            if (lostArticlesDiff != 0) {
                todaysResults.push({
                    event: 'lost_articles_change',
                    diff: lostArticlesDiff,
                    new_total: results.lostArticles,
                    timestamp: responseDate
                })
            }

            let itemsClaimedDiff = results.itemsClaimed - lastResult.itemsClaimed
            if (lostArticlesDiff != 0) {
                todaysResults.push({
                    event: 'items_claimed_change',
                    diff: itemsClaimedDiff,
                    new_total: results.itemsClaimed,
                    timestamp: responseDate
                })
            }

            if (todaysResults.length > 0) {
                return fs.writeFileAsync(__dirname + '/data/' + todayDate + '.json',JSON.stringify(todaysResults,null,2));
            }

        }).then(() => {
            fs.writeFileAsync(__dirname + '/data/last-result.json',JSON.stringify(results,null,2));
        })


    })
}

doCheck()