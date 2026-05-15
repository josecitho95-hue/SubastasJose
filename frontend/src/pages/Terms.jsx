export default function Terms() {
  return (
    <div className="section py-12 fade-up">
      <div className="max-w-2xl mx-auto card p-8 space-y-6">
        <h1 className="text-2xl font-bold text-stone-900">Términos y Condiciones de Uso</h1>
        <p className="text-sm text-stone-400">SubastasGeek — Última actualización: 15 de abril de 2026</p>

        <div className="space-y-4 text-sm text-stone-600 leading-relaxed">

          <h2 className="font-semibold text-stone-800 text-base mt-4">I. Aceptación y Capacidad</h2>
          <p>
            Al registrarse en <strong>SubastasGeek</strong>, usted acepta estos términos. El uso de la plataforma está restringido a mayores de 18 años con capacidad legal para contratar.
          </p>

          <h2 className="font-semibold text-stone-800 text-base mt-4">II. Depósitos en Garantía y Pagos</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Para participar en cualquier subasta, el usuario debe realizar un depósito en garantía mediante tarjeta de crédito, débito u OXXO Pay.</li>
            <li>Este saldo permanecerá "retenido" mientras el usuario sea el líder de una subasta activa. Si el usuario es superado, el saldo se libera inmediatamente para ser utilizado en otras pujas.</li>
            <li>SubastasGeek utiliza <strong>Stripe Payments México</strong>; no almacenamos los datos crudos de su tarjeta.</li>
          </ul>

          <h2 className="font-semibold text-stone-800 text-base mt-4">III. Mecánica de la Subasta y Ofertas Vinculantes</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Pujas Atómicas:</strong> Toda puja confirmada en el sistema es final y legalmente vinculante. No se pueden cancelar pujas.</li>
            <li><strong>Anti-Sniping:</strong> Si se recibe una puja en los últimos 60 segundos de la subasta, el reloj se extenderá automáticamente 60 segundos adicionales para garantizar una competencia justa.</li>
            <li><strong>Cierre de Subasta:</strong> El ganador será aquel con la puja más alta validada por nuestros servidores en el momento del cierre. El reloj del servidor de SubastasGeek es la única fuente de la verdad.</li>
          </ul>

          <h2 className="font-semibold text-stone-800 text-base mt-4">IV. Obligaciones del Ganador y Penalizaciones</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Al ganar una subasta, el saldo retenido en garantía será procesado automáticamente para cubrir total o parcialmente el costo del artículo.</li>
            <li>Si el método de pago del ganador es rechazado para el cobro final, el usuario tendrá <strong>48 horas</strong> para regularizar el pago.</li>
            <li><strong>Penalización:</strong> El incumplimiento de pago resultará en la suspensión permanente de la cuenta y la pérdida del depósito en garantía por concepto de daños administrativos.</li>
          </ul>

          <h2 className="font-semibold text-stone-800 text-base mt-4">V. Envíos y Entregas</h2>
          <p>
            Los artículos serán enviados a la dirección registrada en un plazo acordado tras la confirmación total del pago. El riesgo de pérdida se transfiere al comprador en el momento de la entrega por parte de la mensajería.
          </p>

          <h2 className="font-semibold text-stone-800 text-base mt-4">VI. Jurisdicción y Resolución de Controversias</h2>
          <p>
            Para la interpretación y cumplimiento de los presentes Términos, las partes se someten a la competencia de la <strong>Procuraduría Federal del Consumidor (PROFECO)</strong> y a los tribunales aplicables de la Ciudad de México.
          </p>

        </div>
      </div>
    </div>
  )
}
