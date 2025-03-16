// dataParserExchangeFormat.js

// Build a map of propertyDefinitionRef -> propertyDefinitionName
function parsePropertyDefinitionsFromXml(xml) {
    const propDefs = xml.querySelectorAll("model > propertyDefinitions > propertyDefinition");
    if (!propDefs || propDefs.length === 0) {
      console.warn("No propertyDefinition tags found under <model><propertyDefinitions>");
    }
    const propertyDefinitionsMap = Array.from(propDefs).reduce((acc, def) => {
      const identifier = def.getAttribute("identifier");
      const nameElem = def.querySelector("name");
      const name = nameElem ? nameElem.textContent : "unknown";
      acc[identifier] = name;
      return acc;
    }, {});
    console.log("🔎 propertyDefinitionsMap:", propertyDefinitionsMap);
    return propertyDefinitionsMap;
  }
  
  // Parse nodes from <model><elements><element>
  function parseNodesFromXml(xml, propertyDefinitionsMap) {
    // The standard ArchiMate exchange format: <model><elements>
    const elementsContainer = xml.querySelector("model > elements");
    if (!elementsContainer) {
      console.warn("No <elements> container found under <model>.");
      return [];
    }
    // Grab the <element> nodes
    const elementElems = elementsContainer.querySelectorAll("element");
    console.log(`🔎 Found ${elementElems.length} <element> tags under <model><elements>.`);
    
    // Filter out diagram references like archimate:ArchimateDiagramModel
    const nodes = Array.from(elementElems)
      .filter(el => {
        const xsiType = el.getAttribute("xsi:type") || el.getAttribute("type");
        return !xsiType?.includes("ArchimateDiagramModel");
      })
      .map(el => {
        const id = el.getAttribute("identifier") || "no-id";
        const xsiType = el.getAttribute("xsi:type") || el.getAttribute("type") || "Element";
        const nameElem = el.querySelector("name");
        const documentationElem = el.querySelector("documentation");
        
        // Parse properties
        const properties = {};
        el.querySelectorAll("property").forEach(prop => {
          const refId = prop.getAttribute("propertyDefinitionRef");
          const propName = propertyDefinitionsMap[refId] || "unknown";
          const valueElem = prop.querySelector("value");
          properties[propName.toLowerCase()] = valueElem ? valueElem.textContent : "";
        });
  
        return {
          id,
          type: xsiType,
          name: nameElem ? nameElem.textContent : "",
          documentation: documentationElem ? documentationElem.textContent : "",
          properties
        };
      });
  
    console.log("✅ Parsed Nodes:", nodes);
    return nodes;
  }
  
  // Parse relationships (links) from <model><relationships><relationship>
  function parseLinksFromXml(xml, propertyDefinitionsMap) {
    const relationshipsContainer = xml.querySelector("model > relationships");
    if (!relationshipsContainer) {
      console.warn("No <relationships> container found under <model>.");
      return [];
    }
    const relationshipElems = relationshipsContainer.querySelectorAll("relationship");
    console.log(`🔎 Found ${relationshipElems.length} <relationship> tags under <model><relationships>.`);
  
    const links = Array.from(relationshipElems).map(r => {
      const id = r.getAttribute("identifier") || "no-rel-id";
      const xsiType = r.getAttribute("xsi:type") || r.getAttribute("type") || "Relationship";
      const nameElem = r.querySelector("name");
      const documentationElem = r.querySelector("documentation");
      const source = r.getAttribute("source")?.trim() || null;
      const target = r.getAttribute("target")?.trim() || null;
  
      // Parse relationship properties
      const properties = {};
      r.querySelectorAll("property").forEach(prop => {
        const refId = prop.getAttribute("propertyDefinitionRef");
        const propName = propertyDefinitionsMap[refId] || "unknown";
        const valueElem = prop.querySelector("value");
        properties[propName.toLowerCase()] = valueElem ? valueElem.textContent : "";
      });
  
      return {
        id,
        type: xsiType,
        name: nameElem ? nameElem.textContent : "",
        documentation: documentationElem ? documentationElem.textContent : "",
        source,
        target,
        properties
      };
    });
  
    console.log("✅ Parsed Links:", links);
    return links;
  }
  
  // Convert the entire ArchiMate Model XML to a simple JSON object
  function convertXmlToJson(xml) {
    const model = xml.querySelector("model");
    if (!model) {
      console.warn("No <model> element found in the XML.");
      return { modelName: "Unnamed Model", modelDocumentation: "", nodes: [], links: [] };
    }
  
    const nameElem = model.querySelector("name");
    const documentationElem = model.querySelector("documentation");
    const modelName = nameElem ? nameElem.textContent : "Unnamed Model";
    const modelDocumentation = documentationElem ? documentationElem.textContent : "";
  
    const propertyDefinitionsMap = parsePropertyDefinitionsFromXml(xml);
    const nodes = parseNodesFromXml(xml, propertyDefinitionsMap);
    const links = parseLinksFromXml(xml, propertyDefinitionsMap);
  
    console.log("🎯 Final Graph Data JSON:", {
      modelName,
      modelDocumentation,
      nodesCount: nodes.length,
      linksCount: links.length
    });
  
    return {
      modelName,
      modelDocumentation,
      nodes,
      links
    };
  }
  
  export {
    convertXmlToJson
  };  