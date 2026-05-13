export default function Terms() {
  return (
    <div className="section py-12 fade-up">
      <div className="max-w-2xl mx-auto card p-8 space-y-6">
        <h1 className="text-2xl font-bold text-stone-900">Términos y Condiciones de Uso</h1>
        <p className="text-sm text-stone-400">Última actualización: 12 de mayo de 2026</p>

        <div className="space-y-4 text-sm text-stone-600 leading-relaxed">
          <p>
            Bienvenido a <strong>Subastas</strong>. Al acceder y utilizar nuestra plataforma, aceptas cumplir con los siguientes términos y condiciones. Si no estás de acuerdo con alguna parte de estos términos, te pedimos que no utilices nuestros servicios.
          </p>

          <h2 className="font-semibold text-stone-800 text-base mt-4">1. Definiciones</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Plataforma:</strong> El sitio web y servicios de Subastas.</li>
            <li><strong>Usuario:</strong> Cualquier persona que se registre y utilice la plataforma.</li>
            <li><strong>Subasta:</strong> Proceso de venta en el que los usuarios pujan por un artículo.</li>
            <li><strong>Puja:</strong> Oferta de compra realizada por un usuario durante una subasta.</li>
          </ul>

          <h2 className="font-semibold text-stone-800 text-base mt-4">2. Registro y Cuenta</h2>
          <p>
            Para participar en subastas debes registrarte proporcionando información veraz y completa. Eres responsable de mantener la confidencialidad de tu contraseña y de todas las actividades que ocurran bajo tu cuenta. Debes ser mayor de edad (18 años) y tener capacidad legal para contratar.
          </p>

          <h2 className="font-semibold text-stone-800 text-base mt-4">3. Proceso de Subastas</h2>
          <p>
            Las subastas se realizan en tiempo real. Al pujar, te comprometes a pagar el monto ofrecido si resultas ganador. Tu saldo será retenido como garantía durante la subasta. Si eres superado, el saldo retenido se libera automáticamente.
          </p>

          <h2 className="font-semibold text-stone-800 text-base mt-4">4. Pagos y Penalizaciones</h2>
          <p>
            El ganador de una subasta tiene un plazo de 48 horas para confirmar el pago. Si no se realiza el pago dentro del plazo, la subasta se marcará como vencida y podrán aplicarse penalizaciones según las políticas vigentes. Los depósitos se realizan a través de Stripe y están sujetos a los topes regulatorios (LFPIORPI).
          </p>

          <h2 className="font-semibold text-stone-800 text-base mt-4">5. Envíos y Entregas</h2>
          <p>
            Una vez confirmado el pago, el artículo será preparado para envío. Los métodos de envío disponibles son: estándar, express y recogida en tienda. Los tiempos de entrega son estimados y pueden variar según la ubicación.
          </p>

          <h2 className="font-semibold text-stone-800 text-base mt-4">6. Verificación de Identidad (KYC)</h2>
          <p>
            Para proteger la integridad de la plataforma, requerimos verificación de identidad (KYC) antes de permitir pujas. Los documentos proporcionados son tratados conforme a nuestro Aviso de Privacidad y la LFPDPPP.
          </p>

          <h2 className="font-semibold text-stone-800 text-base mt-4">7. Limitación de Responsabilidad</h2>
          <p>
            Subastas no se hace responsable por fallas técnicas, interrupciones del servicio o pérdidas derivadas del uso de la plataforma más allá de lo establecido por la legislación aplicable en México.
          </p>

          <h2 className="font-semibold text-stone-800 text-base mt-4">8. Modificaciones</h2>
          <p>
            Nos reservamos el derecho de modificar estos términos en cualquier momento. Los cambios entrarán en vigor desde su publicación en la plataforma. Te recomendamos revisar periódicamente esta página.
          </p>

          <h2 className="font-semibold text-stone-800 text-base mt-4">9. Ley Aplicable</h2>
          <p>
            Estos términos se rigen por las leyes de los Estados Unidos Mexicanos. Cualquier controversia será sometida a los tribunales competentes de la Ciudad de México.
          </p>

          <h2 className="font-semibold text-stone-800 text-base mt-4">10. Contacto</h2>
          <p>
            Para cualquier duda o reclamación, contacta a nuestro equipo de soporte a través de los canales disponibles en la plataforma.
          </p>
        </div>
      </div>
    </div>
  )
}
