import { CodeModel, Parameter, isVirtualParameter, ObjectSchema, isObjectSchema, getAllParentProperties, Languages, SchemaType, Schema, ChoiceSchema, SealedChoiceSchema, GroupSchema, ImplementationLocation, Operation, Request } from '@azure-tools/codemodel';
import { Session } from '@azure-tools/autorest-extension-base';
import { values, length, Dictionary, when } from '@azure-tools/linq';
import { removeSequentialDuplicates, fixLeadingNumber, deconstruct, selectName, Style, Styler, pascalCase } from '@azure-tools/codegen';

function getNameOptions(typeName: string, components: Array<string>) {
  const result = new Set<string>();

  // add a variant for each incrementally inclusive parent naming scheme.
  for (let i = 0; i < length(components); i++) {
    const subset = Style.pascal([...removeSequentialDuplicates(components.slice(-1 * i, length(components)))]);
    result.add(subset);
  }

  // add a second-to-last-ditch option as <typename>.<name>
  result.add(Style.pascal([...removeSequentialDuplicates([...fixLeadingNumber(deconstruct(typeName)), ...deconstruct(components.last)])]));
  return [...result.values()];
}

function isUnassigned(value: string) {
  return !value || (value.indexOf('·') > -1);
}

function setName(thing: { language: Languages }, styler: Styler, defaultValue: string, overrides: Dictionary<string>) {
  thing.language.default.name = styler(defaultValue && isUnassigned(thing.language.default.name) ? defaultValue : thing.language.default.name, true, overrides);
  if (!thing.language.default.name) {
    throw new Error('Name is empty!');
  }
}

function setNameAllowEmpty(thing: { language: Languages }, styler: Styler, defaultValue: string, overrides: Dictionary<string>) {
  thing.language.default.name = styler(defaultValue && isUnassigned(thing.language.default.name) ? defaultValue : thing.language.default.name, true, overrides);
}

export class PreNamer {
  codeModel: CodeModel
  options: Dictionary<any> = {};
  format = {
    parameter: Style.camel,
    property: Style.camel,
    operation: Style.pascal,
    operationGroup: Style.pascal,
    choice: Style.pascal,
    choiceValue: Style.pascal,
    constant: Style.pascal,
    type: Style.pascal,
    client: Style.pascal,
    local: Style.camel,
    global: Style.pascal,
    override: <Dictionary<string>>{}
  }

  enum = 0;
  constant = 0;
  constructor(protected session: Session<CodeModel>) {
    this.codeModel = session.model;// shadow(session.model, filename);
  }

  async init() {
    // get our configuration for this run.
    this.options = await this.session.getValue('modelerfour', {});
    const naming = this.options.naming || {};
    const maxPreserve = Number(naming['preserve-uppercase-max-length']) || 3;
    this.format = {

      parameter: Style.select(naming.parameter, Style.camel, maxPreserve),
      property: Style.select(naming.property, Style.camel, maxPreserve),
      operation: Style.select(naming.operation, Style.pascal, maxPreserve),
      operationGroup: Style.select(naming.operationGroup, Style.pascal, maxPreserve),
      choice: Style.select(naming.choice, Style.pascal, maxPreserve),
      choiceValue: Style.select(naming.choiceValue, Style.pascal, maxPreserve),
      constant: Style.select(naming.constant, Style.pascal, maxPreserve),
      client: Style.select(naming.client, Style.pascal, maxPreserve),
      type: Style.select(naming.type, Style.pascal, maxPreserve),
      local: Style.select(naming.local, Style.camel, maxPreserve),
      global: Style.select(naming.global, Style.pascal, maxPreserve),
      override: naming.override || {}
    }
    return this;
  }

  isUnassigned(value: string) {
    return !value || (value.indexOf('·') > -1);
  }

  process() {
    if (this.options['prenamer'] === false) {
      return this.codeModel;
    }

    // choice
    for (const schema of values(this.codeModel.schemas.choices)) {
      setName(schema, this.format.choice, `Enum${this.enum++}`, this.format.override);
      for (const choice of values(schema.choices)) {
        setName(choice, this.format.choiceValue, '', this.format.override);
      }
    }

    // sealed choice
    for (const schema of values(this.codeModel.schemas.sealedChoices)) {
      setName(schema, this.format.choice, `Enum${this.enum++}`, this.format.override);
      for (const choice of values(schema.choices)) {
        setName(choice, this.format.choiceValue, '', this.format.override);
      }
    }

    // constant
    for (const schema of values(this.codeModel.schemas.constants)) {
      setName(schema, this.format.constant, `Constant${this.enum++}`, this.format.override);
    }

    // strings
    for (const schema of values(this.codeModel.schemas.strings)) {
      setName(schema, this.format.type, schema.type, this.format.override);
    }

    // number
    for (const schema of values(this.codeModel.schemas.numbers)) {
      setName(schema, this.format.type, schema.type, this.format.override);
    }

    for (const schema of values(this.codeModel.schemas.dates)) {
      setName(schema, this.format.type, schema.type, this.format.override);
    }
    for (const schema of values(this.codeModel.schemas.dateTimes)) {
      setName(schema, this.format.type, schema.type, this.format.override);
    }
    for (const schema of values(this.codeModel.schemas.durations)) {
      setName(schema, this.format.type, schema.type, this.format.override);
    }
    for (const schema of values(this.codeModel.schemas.uuids)) {
      setName(schema, this.format.type, schema.type, this.format.override);
    }

    for (const schema of values(this.codeModel.schemas.uris)) {
      setName(schema, this.format.type, schema.type, this.format.override);
    }

    for (const schema of values(this.codeModel.schemas.unixtimes)) {
      setName(schema, this.format.type, schema.type, this.format.override);

      if (isUnassigned(schema.language.default.description)) {
        schema.language.default.description = 'date in seconds since 1970-01-01T00:00:00Z.';
      }
    }

    for (const schema of values(this.codeModel.schemas.byteArrays)) {
      setName(schema, this.format.type, schema.type, this.format.override);
    }

    for (const schema of values(this.codeModel.schemas.chars)) {
      setName(schema, this.format.type, schema.type, this.format.override);
    }

    for (const schema of values(this.codeModel.schemas.booleans)) {
      setName(schema, this.format.type, schema.type, this.format.override);
    }

    for (const schema of values(this.codeModel.schemas.flags)) {
      setName(schema, this.format.type, schema.type, this.format.override);
    }

    // dictionary
    for (const schema of values(this.codeModel.schemas.dictionaries)) {
      setName(schema, this.format.type, `DictionaryOf${schema.elementType.language.default.name}`, this.format.override);
      if (isUnassigned(schema.language.default.description)) {
        schema.language.default.description = `Dictionary of ${schema.elementType.language.default.name}`;
      }
    }

    for (const schema of values(this.codeModel.schemas.arrays)) {
      setName(schema, this.format.type, `ArrayOf${schema.elementType.language.default.name}`, this.format.override);
      if (this.isUnassigned(schema.language.default.description)) {
        schema.language.default.description = `Array of ${schema.elementType.language.default.name}`;
      }
    }


    for (const schema of values(this.codeModel.schemas.objects)) {
      setName(schema, this.format.type, '', this.format.override);
      for (const property of values(schema.properties)) {
        setName(property, this.format.property, '', this.format.override);
      }
    }

    for (const schema of values(this.codeModel.schemas.groups)) {
      setName(schema, this.format.type, '', this.format.override);
      for (const property of values(schema.properties)) {
        setName(property, this.format.property, '', this.format.override);
      }
    }

    for (const parameter of values(this.codeModel.globalParameters)) {
      if (parameter.schema.type === SchemaType.Constant) {
        setName(parameter, this.format.constant, '', this.format.override);
      } else {
        setName(parameter, this.format.parameter, '', this.format.override);
      }
    }

    for (const operationGroup of this.codeModel.operationGroups) {
      setNameAllowEmpty(operationGroup, this.format.operationGroup, operationGroup.$key, this.format.override);
      for (const operation of operationGroup.operations) {
        setName(operation, this.format.operation, '', this.format.override);

        this.setParameterNames(operation);
        for (const request of values(operation.requests)) {
          this.setParameterNames(request);
        }

        const p = operation.language.default.paging;
        if (p) {
          p.group = p.group ? this.format.operationGroup(p.group, true, this.format.override) : undefined;
          p.member = p.member ? this.format.operation(p.member, true, this.format.override) : undefined;
        }
      }
    }

    // set a styled client name
    setName(this.codeModel, this.format.client, this.codeModel.info.title, this.format.override);

    // fix collisions from flattening on ObjectSchemas
    this.fixPropertyCollisions();

    // fix collisions from flattening on VirtualParameters
    this.fixParameterCollisions();

    if (this.options['resolve-schema-name-collisons']) {
      // fix collision on schema names after naming everything.
      this.fixSchemaCollisions();
    }

    return this.codeModel;
  }
  private setParameterNames(parameterContainer: Operation | Request) {
    for (const parameter of values(parameterContainer.signatureParameters)) {
      if (parameter.schema.type === SchemaType.Constant) {
        setName(parameter, this.format.constant, '', this.format.override);
      }
      else {
        setName(parameter, this.format.parameter, '', this.format.override);
      }
    }
    for (const parameter of values(parameterContainer.parameters)) {
      if ((parameterContainer.signatureParameters ?? []).indexOf(parameter) === -1) {
        if (parameter.schema.type === SchemaType.Constant) {
          setName(parameter, this.format.constant, '', this.format.override);
        }
        else {
          if (parameter.implementation === ImplementationLocation.Client) {
            setName(parameter, this.format.global, '', this.format.override);
          }
          else {
            setName(parameter, this.format.local, '', this.format.override);
          }
        }
      }
    }
  }

  fixParameterCollisions() {
    for (const operation of values(this.codeModel.operationGroups).selectMany(each => each.operations)) {
      for (const request of values(operation.requests)) {
        const parameters = values(operation.signatureParameters).concat(values(request.signatureParameters));

        const usedNames = new Set<string>();
        const collisions = new Set<Parameter>();

        // we need to make sure we avoid name collisions. operation parameters get first crack.
        for (const each of values(parameters)) {
          const name = this.format.parameter(each.language.default.name);

          if (usedNames.has(name)) {
            collisions.add(each);
          } else {
            usedNames.add(name);
          }
        }

        // handle operation parameters
        for (const parameter of collisions) {
          let options = [parameter.language.default.name];
          if (isVirtualParameter(parameter)) {
            options = getNameOptions(parameter.schema.language.default.name, [parameter.language.default.name, ...parameter.pathToProperty.map(each => each.language.default.name)]).map(each => this.format.parameter(each));
          }
          parameter.language.default.name = this.format.parameter(selectName(options, usedNames));
        }
      }

    }

  }

  fixCollisions(schema: ObjectSchema) {
    for (const each of values(schema.parents?.immediate).where(each => isObjectSchema(each))) {
      this.fixCollisions(<ObjectSchema>each);
    }
    const [owned, flattened] = values(schema.properties).bifurcate(each => length(each.flattenedNames) === 0);
    const inherited = [...getAllParentProperties(schema)];

    const all = [...owned, ...inherited, ...flattened];

    const inlined = new Map<string, number>();
    for (const each of all) {
      const name = this.format.property(each.language.default.name);
      // track number of instances of a given name.
      inlined.set(name, (inlined.get(name) || 0) + 1);
    }

    const usedNames = new Set(inlined.keys());
    for (const each of flattened /*.sort((a, b) => length(a.nameOptions) - length(b.nameOptions)) */) {
      const ct = inlined.get(this.format.property(each.language.default.name));
      if (ct && ct > 1) {
        const options = getNameOptions(each.schema.language.default.name, [each.language.default.name, ...values(each.flattenedNames)]);
        each.language.default.name = this.format.property(selectName(options, usedNames));
      }
    }
  }

  fixPropertyCollisions() {
    for (const schema of values(this.codeModel.schemas.objects)) {
      this.fixCollisions(schema);
    }
  }

  fixSchemaCollisions() {
    const usedNames = new Map<string, Array<Schema>>();

    // schemas - 
    for (const schema of values(this.codeModel.schemas.objects)) {
      const name = schema.language.default.name;

      when(usedNames.get(name), (values) => {
        // verify that the schema is in a different namespace
        for (const existingSchema of values) {
          const namespace = schema.language.default.namespace;
          if (existingSchema.language.default.namespace === namespace) {
            // bad news! actual schema collision
            this.session.error(`Two object schemas have name '${name}' in the same namespace '${namespace}'-- you must add a client name.`, [], existingSchema);
          } else {
            // otherwise, just add this one to the list.
            values.push(schema)
          }
        }
      }, () => usedNames.set(name, [schema]));
    }

    for (const schema of values(this.codeModel.schemas.groups)) {
      const name = schema.language.default.name;

      when(usedNames.get(name), (values) => {
        // verify that the schema is in a different namespace
        for (const existingSchema of values) {
          const namespace = schema.language.default.namespace;
          if (existingSchema.language.default.namespace === namespace) {
            // bad news! actual schema collision
            this.session.error(`A parameter-group schema '${name}' is colliding in the same namespace '${namespace}'-- you must change the group name.`, []);
          } else {
            // otherwise, just add this one to the list.
            values.push(schema)
          }
        }
      }, () => usedNames.set(name, [schema]));
    }

    for (const schema of values(this.codeModel.schemas.choices)) {
      const name = schema.language.default.name;

      when(usedNames.get(name), (values) => {
        // enum schemas should not overlap with object or group schemas, regardless of namespace
        if (!name.endsWith('Enum')) {
          const newname = this.format.choice(`${name}Enum`, false, this.format.override);
          if (usedNames.has(newname)) {
            this.session.error(`Enum Schema '${name}' collides with another schema -- you must add a client name.`, []);
          } else {
            // update the name and move on.
            schema.language.default.name = newname;
            usedNames.set(newname, [schema]);
          }
        }
      }, () => usedNames.set(name, [schema]));
    }
    for (const schema of values(this.codeModel.schemas.sealedChoices)) {
      const name = schema.language.default.name;

      when(usedNames.get(name), (values) => {
        // enum schemas should not overlap with object or group schemas, regardless of namespace
        if (!name.endsWith('Enum')) {
          const newname = this.format.choice(`${name}Enum`, false, this.format.override);
          if (usedNames.has(newname)) {
            this.session.error(`Enum Schema '${name}' collides with another schema -- you must add a client name.`, []);
          } else {
            // update the name and move on.
            schema.language.default.name = newname;
            usedNames.set(newname, [schema]);
          }
        }
      }, () => usedNames.set(name, [schema]));
    }
  }
}
